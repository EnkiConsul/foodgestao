-- 1) Seeder: contas que casam com o modelo padrão voltam a ficar ativas
CREATE OR REPLACE FUNCTION public.chart_accounts_seed_tree(_user_id uuid, _context context_type DEFAULT 'pj'::context_type, _company_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _t record;
  _ids jsonb := '{}'::jsonb;
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

  FOR _t IN
    SELECT * FROM public.chart_account_templates
    WHERE is_active
    ORDER BY sort_order, code
  LOOP
    _parent_id := NULL;
    IF _t.parent_code IS NOT NULL THEN
      _parent_id := NULLIF(_ids->>_t.parent_code, '')::uuid;
      IF _parent_id IS NULL THEN CONTINUE; END IF;
    END IF;

    _existing_id := NULL;

    IF _t.template_key IS NOT NULL THEN
      SELECT id INTO _existing_id
      FROM public.chart_accounts
      WHERE user_id = _user_id AND context = _context AND template_key = _t.template_key
      LIMIT 1;
    END IF;

    IF _existing_id IS NULL THEN
      SELECT id INTO _existing_id
      FROM public.chart_accounts
      WHERE user_id = _user_id
        AND context = _context
        AND name = _t.name
        AND parent_id IS NOT DISTINCT FROM _parent_id
      LIMIT 1;
    END IF;

    IF _existing_id IS NOT NULL THEN
      _new_id := _existing_id;
      UPDATE public.chart_accounts SET
        template_key = COALESCE(template_key, _t.template_key),
        template_version = _t.template_version,
        usage_description = COALESCE(_t.usage_description, usage_description),
        description = COALESCE(description, _t.usage_description),
        keywords = CASE WHEN keywords = '{}'::text[] THEN _t.keywords ELSE keywords END,
        allowed_category_subtypes = _t.allowed_category_subtypes,
        allowed_transaction_types = _t.allowed_transaction_types,
        allow_transactions = _t.allow_transactions,
        requires_review = _t.requires_review,
        temporary_account = _t.temporary_account,
        normal_balance = _t.normal_balance,
        statement_group = _t.statement_group,
        cash_flow_behavior = _t.cash_flow_behavior,
        is_tax = _t.is_tax,
        is_dynamic = _t.is_dynamic,
        is_reducer = _t.is_reducer,
        dre_line = _t.dre_line,
        is_active = true
      WHERE id = _new_id;
    ELSE
      INSERT INTO public.chart_accounts (
        user_id, context, code, name, description, parent_id,
        allow_transactions, is_active, is_tax, visible_pf,
        template_key, template_version, usage_description, keywords,
        allowed_category_subtypes, allowed_transaction_types,
        requires_review, is_dynamic, is_reducer, dre_line,
        normal_balance, statement_group, cash_flow_behavior, temporary_account
      ) VALUES (
        _user_id, _context, _t.code, _t.name, _t.usage_description, _parent_id,
        _t.allow_transactions, true, _t.is_tax, (_context = 'pf'),
        _t.template_key, _t.template_version, _t.usage_description, _t.keywords,
        _t.allowed_category_subtypes, _t.allowed_transaction_types,
        _t.requires_review, _t.is_dynamic, _t.is_reducer, _t.dre_line,
        _t.normal_balance, _t.statement_group, _t.cash_flow_behavior, _t.temporary_account
      )
      ON CONFLICT (user_id, context, code) DO UPDATE
        SET template_key = COALESCE(public.chart_accounts.template_key, EXCLUDED.template_key),
            is_active = true
      RETURNING id INTO _new_id;
      _inserted := _inserted + 1;
    END IF;

    _ids := _ids || jsonb_build_object(_t.code, _new_id::text);

    IF _company_id IS NOT NULL THEN
      INSERT INTO public.chart_account_companies (chart_account_id, company_id)
      VALUES (_new_id, _company_id)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  RETURN _inserted;
END;
$function$;

-- 2) Nova empresa: vincula somente contas ativas e garante o modelo padrão completo
CREATE OR REPLACE FUNCTION public.chart_accounts_ensure_for_company(_company_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- Vincula apenas as contas ativas já existentes do titular
  INSERT INTO public.chart_account_companies (chart_account_id, company_id)
  SELECT a.id, _company_id
  FROM public.chart_accounts a
  WHERE a.user_id = _owner AND a.context = 'pj' AND a.is_active
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS _linked = ROW_COUNT;

  -- Garante (e reativa) o modelo padrão completo, já vinculado
  PERFORM public.chart_accounts_seed_tree(_owner, 'pj'::context_type, _company_id);

  SELECT count(*) INTO _linked
  FROM public.chart_account_companies cc
  WHERE cc.company_id = _company_id;

  RETURN _linked;
END;
$function$;