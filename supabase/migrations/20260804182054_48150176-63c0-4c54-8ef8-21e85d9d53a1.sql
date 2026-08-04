UPDATE public.category_templates SET chart_account_code = '4.1.1' WHERE code = '1.1.1';
UPDATE public.category_templates SET chart_account_code = '4.1.2' WHERE code = '1.1.2';
UPDATE public.category_templates SET chart_account_code = '4.1.3' WHERE code = '1.1.3';
UPDATE public.category_templates SET chart_account_code = '4.1.4' WHERE code = '1.1.4';
UPDATE public.category_templates SET chart_account_code = '4.1.5' WHERE code = '1.1.5';
UPDATE public.category_templates SET chart_account_code = '4.2.1' WHERE code = '1.2.1';
UPDATE public.category_templates SET chart_account_code = '4.2.2' WHERE code IN ('1.2.2','1.2.3');
UPDATE public.category_templates SET chart_account_code = '1.5.1' WHERE code = '1.2.4';
UPDATE public.category_templates SET chart_account_code = '3.1.1' WHERE code = '1.3.1';
UPDATE public.category_templates SET chart_account_code = '2.7.1' WHERE code IN ('1.3.2','2.9.2','2.9.4');
UPDATE public.category_templates SET chart_account_code = '2.4.1' WHERE code IN ('1.3.3','2.9.3');
UPDATE public.category_templates SET chart_account_code = '2.5.1' WHERE code = '1.3.4';
UPDATE public.category_templates SET chart_account_code = '8.1.1' WHERE code = '2.1.1';
UPDATE public.category_templates SET chart_account_code = '8.3.1' WHERE code = '2.1.2';
UPDATE public.category_templates SET chart_account_code = '8.3.2' WHERE code = '2.1.3';
UPDATE public.category_templates SET chart_account_code = '5.1.1' WHERE code = '2.2.1';
UPDATE public.category_templates SET chart_account_code = '5.1.2' WHERE code = '2.2.2';
UPDATE public.category_templates SET chart_account_code = '5.1.3' WHERE code = '2.2.3';
UPDATE public.category_templates SET chart_account_code = '5.1.4' WHERE code = '2.2.4';
UPDATE public.category_templates SET chart_account_code = '5.2.1' WHERE code = '2.3.1';
UPDATE public.category_templates SET chart_account_code = '5.2.3' WHERE code = '2.3.2';
UPDATE public.category_templates SET chart_account_code = '6.3.2' WHERE code IN ('2.3.3','2.3.5');
UPDATE public.category_templates SET chart_account_code = '5.2.2' WHERE code = '2.3.4';
UPDATE public.category_templates SET chart_account_code = '6.1.1' WHERE code = '2.4.1';
UPDATE public.category_templates SET chart_account_code = '6.1.2' WHERE code = '2.4.2';
UPDATE public.category_templates SET chart_account_code = '6.1.3' WHERE code = '2.4.3';
UPDATE public.category_templates SET chart_account_code = '6.1.4' WHERE code = '2.4.4';
UPDATE public.category_templates SET chart_account_code = '6.2.1' WHERE code = '2.5.1';
UPDATE public.category_templates SET chart_account_code = '6.2.2' WHERE code = '2.5.2';
UPDATE public.category_templates SET chart_account_code = '6.2.3' WHERE code = '2.5.3';
UPDATE public.category_templates SET chart_account_code = '6.2.4' WHERE code = '2.5.4';
UPDATE public.category_templates SET chart_account_code = '6.2.5' WHERE code = '2.5.5';
UPDATE public.category_templates SET chart_account_code = '6.3.1' WHERE code = '2.6.1';
UPDATE public.category_templates SET chart_account_code = '6.3.3' WHERE code = '2.6.2';
UPDATE public.category_templates SET chart_account_code = '6.3.4' WHERE code = '2.6.3';
UPDATE public.category_templates SET chart_account_code = '6.3.5' WHERE code = '2.6.4';
UPDATE public.category_templates SET chart_account_code = '7.1.1' WHERE code = '2.7.1';
UPDATE public.category_templates SET chart_account_code = '7.1.2' WHERE code = '2.7.2';
UPDATE public.category_templates SET chart_account_code = '7.1.3' WHERE code = '2.7.3';
UPDATE public.category_templates SET chart_account_code = '1.5.1' WHERE code = '2.8.1';
UPDATE public.category_templates SET chart_account_code = '1.5.3' WHERE code = '2.8.2';
UPDATE public.category_templates SET chart_account_code = '3.3.1' WHERE code = '2.9.1';
UPDATE public.category_templates SET chart_account_code = '6.4.2' WHERE code = '2.10.1';
UPDATE public.category_templates SET chart_account_code = '9.1.1' WHERE code = '2.10.2';
UPDATE public.category_templates SET chart_account_code = '9.2.1' WHERE code = '3.1';

CREATE OR REPLACE FUNCTION public.chart_accounts_seed_tree(_user_id uuid, _context context_type DEFAULT 'pf'::context_type, _company_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
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
        dre_line = _t.dre_line
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
$fn$;