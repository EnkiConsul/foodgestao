-- 1) Extrai a estrutura padrão do plano de contas para uma função reutilizável
DO $do$
DECLARE
  _src text;
  _js  text;
BEGIN
  _src := pg_get_functiondef('public.chart_accounts_seed_default(uuid,uuid)'::regprocedure);
  _js  := substring(_src from '\$json\$(.*)\$json\$');
  IF _js IS NULL OR length(_js) < 100 THEN
    RAISE EXCEPTION 'Não foi possível extrair a estrutura padrão do plano de contas';
  END IF;
  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.chart_accounts_default_nodes() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public AS $f$ SELECT %L::jsonb $f$',
    _js
  );
END
$do$;

-- 2) Seeder genérico (PJ com empresa ou PF sem empresa), idempotente
CREATE OR REPLACE FUNCTION public.chart_accounts_seed_tree(
  _user_id uuid,
  _context context_type DEFAULT 'pj',
  _company_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _nodes jsonb := public.chart_accounts_default_nodes();
  _ids jsonb := '{}'::jsonb;
  _node jsonb;
  _parent_id uuid;
  _new_id uuid;
  _existing_id uuid;
  _inserted int := 0;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user_id é obrigatório' USING ERRCODE = '22023';
  END IF;
  IF _context = 'pj' AND _company_id IS NULL THEN
    RAISE EXCEPTION 'company_id é obrigatório em PJ' USING ERRCODE = '22023';
  END IF;

  FOR _node IN SELECT * FROM jsonb_array_elements(_nodes)
  LOOP
    _parent_id := NULL;
    IF _node->>'p' IS NOT NULL THEN
      _parent_id := NULLIF(_ids->>(_node->>'p'), '')::uuid;
    END IF;

    SELECT id INTO _existing_id
    FROM public.chart_accounts
    WHERE user_id = _user_id
      AND context = _context
      AND name = _node->>'n'
      AND parent_id IS NOT DISTINCT FROM _parent_id
    LIMIT 1;

    IF _existing_id IS NOT NULL THEN
      _new_id := _existing_id;
    ELSE
      INSERT INTO public.chart_accounts (
        user_id, context, name, description, parent_id,
        allow_transactions, is_active, is_tax, visible_pf
      ) VALUES (
        _user_id, _context, _node->>'n', _node->>'d', _parent_id,
        NOT (_node->>'s')::boolean, true, (_node->>'t')::boolean, (_context = 'pf')
      )
      RETURNING id INTO _new_id;
      _inserted := _inserted + 1;
    END IF;

    _ids := _ids || jsonb_build_object(_node->>'k', _new_id::text);

    IF _company_id IS NOT NULL THEN
      INSERT INTO public.chart_account_companies (chart_account_id, company_id)
      VALUES (_new_id, _company_id)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  RETURN _inserted;
END;
$function$;

-- 3) Mantém a assinatura antiga como wrapper
CREATE OR REPLACE FUNCTION public.chart_accounts_seed_default(_user_id uuid, _company_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.chart_accounts_seed_tree(_user_id, 'pj'::context_type, _company_id);
$function$;

-- 4) Garantia idempotente de plano de contas por empresa
CREATE OR REPLACE FUNCTION public.chart_accounts_ensure_for_company(_company_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _owner uuid;
  _links int;
  _linked int := 0;
BEGIN
  IF _company_id IS NULL THEN RETURN 0; END IF;

  SELECT c.user_id INTO _owner FROM public.companies c WHERE c.id = _company_id;
  IF _owner IS NULL THEN RETURN 0; END IF;

  SELECT count(*) INTO _links
  FROM public.chart_account_companies cc
  WHERE cc.company_id = _company_id;

  IF _links > 0 THEN RETURN 0; END IF;

  -- Vincula o plano de contas já existente do titular
  INSERT INTO public.chart_account_companies (chart_account_id, company_id)
  SELECT a.id, _company_id
  FROM public.chart_accounts a
  WHERE a.user_id = _owner AND a.context = 'pj'
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS _linked = ROW_COUNT;

  -- Titular sem plano de contas: cria o padrão já vinculado
  IF _linked = 0 THEN
    PERFORM public.chart_accounts_seed_tree(_owner, 'pj'::context_type, _company_id);
    SELECT count(*) INTO _linked
    FROM public.chart_account_companies cc
    WHERE cc.company_id = _company_id;
  END IF;

  RETURN _linked;
END;
$function$;

-- 5) Trigger de criação de empresa passa a usar a garantia
CREATE OR REPLACE FUNCTION public.chart_accounts_seed_on_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  BEGIN
    PERFORM public.chart_accounts_ensure_for_company(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'chart_accounts_seed_on_company failed for company %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

-- 6) RPC chamada pelo app (rede de segurança ao abrir DRE / Contas Contábeis)
CREATE OR REPLACE FUNCTION public.chart_accounts_ensure(
  _context context_type,
  _company_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _existing int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;

  IF _context = 'pj' THEN
    IF _company_id IS NULL THEN RAISE EXCEPTION 'company_id obrigatório em PJ' USING ERRCODE = '22023'; END IF;
    IF NOT private.is_company_member(_uid, _company_id) THEN
      RAISE EXCEPTION 'Not a company member' USING ERRCODE = '42501';
    END IF;
    RETURN public.chart_accounts_ensure_for_company(_company_id);
  END IF;

  SELECT count(*) INTO _existing
  FROM public.chart_accounts a
  WHERE a.user_id = _uid AND a.context = 'pf';

  IF _existing > 0 THEN RETURN 0; END IF;

  RETURN public.chart_accounts_seed_tree(_uid, 'pf'::context_type, NULL);
END;
$function$;

REVOKE ALL ON FUNCTION public.chart_accounts_seed_tree(uuid, context_type, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chart_accounts_ensure_for_company(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chart_accounts_ensure(context_type, uuid) TO authenticated;