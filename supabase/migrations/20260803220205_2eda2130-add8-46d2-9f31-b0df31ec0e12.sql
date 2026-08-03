CREATE OR REPLACE FUNCTION public.chart_accounts_seed_tree(_user_id uuid, _context context_type DEFAULT 'pj'::context_type, _company_id uuid DEFAULT NULL::uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
      -- pai inativo/ausente: ignora o nó
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
        usage_description = COALESCE(usage_description, _t.usage_description),
        keywords = CASE WHEN keywords = '{}'::text[] THEN _t.keywords ELSE keywords END,
        allowed_category_subtypes = _t.allowed_category_subtypes,
        allowed_transaction_types = _t.allowed_transaction_types,
        requires_review = _t.requires_review,
        is_dynamic = _t.is_dynamic,
        is_reducer = _t.is_reducer,
        dre_line = _t.dre_line
      WHERE id = _new_id;
    ELSE
      INSERT INTO public.chart_accounts (
        user_id, context, code, name, description, parent_id,
        allow_transactions, is_active, is_tax, visible_pf,
        template_key, template_version, usage_description, keywords,
        allowed_category_subtypes, allowed_transaction_types,
        requires_review, is_dynamic, is_reducer, dre_line
      ) VALUES (
        _user_id, _context, _t.code, _t.name, _t.usage_description, _parent_id,
        NOT _t.is_synthetic, true, _t.is_tax, (_context = 'pf'),
        _t.template_key, _t.template_version, _t.usage_description, _t.keywords,
        _t.allowed_category_subtypes, _t.allowed_transaction_types,
        _t.requires_review, _t.is_dynamic, _t.is_reducer, _t.dre_line
      )
      ON CONFLICT (user_id, context, code) DO UPDATE
        SET template_key = COALESCE(public.chart_accounts.template_key, EXCLUDED.template_key)
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