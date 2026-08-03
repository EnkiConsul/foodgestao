ALTER TABLE public.category_templates
  ADD COLUMN IF NOT EXISTS chart_account_code TEXT REFERENCES public.chart_account_templates(code) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_category_templates_chart_account_code
  ON public.category_templates (chart_account_code);

CREATE OR REPLACE FUNCTION public.seed_default_categories(_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _owner uuid;
  _tpl record;
  _parent_id uuid;
  _new_id uuid;
  _existing_id uuid;
  _chart_id uuid;
  _created int := 0;
  _skipped int := 0;
  _map jsonb := '{}'::jsonb;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT user_id INTO _owner FROM public.companies WHERE id = _company_id;
  IF _owner IS NULL THEN
    RAISE EXCEPTION 'Empresa não encontrada' USING ERRCODE = '22023';
  END IF;
  IF _owner <> _uid AND NOT public.is_super_admin(_uid) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  FOR _tpl IN
    SELECT * FROM public.category_templates ORDER BY level ASC, sort_order ASC
  LOOP
    _parent_id := NULL;
    IF _tpl.parent_code IS NOT NULL THEN
      _parent_id := NULLIF(_map->>_tpl.parent_code, '')::uuid;
    END IF;

    _chart_id := NULL;
    IF _tpl.chart_account_code IS NOT NULL THEN
      SELECT ca.id INTO _chart_id
        FROM public.chart_accounts ca
        JOIN public.chart_account_companies cac
          ON cac.chart_account_id = ca.id AND cac.company_id = _company_id
       WHERE ca.code = _tpl.chart_account_code
       LIMIT 1;
    END IF;

    SELECT id INTO _existing_id
      FROM public.categories
     WHERE user_id = _owner
       AND company_id = _company_id
       AND template_code = _tpl.code
     LIMIT 1;

    IF _existing_id IS NOT NULL THEN
      _new_id := _existing_id;
      _skipped := _skipped + 1;
      IF _chart_id IS NOT NULL THEN
        UPDATE public.categories
           SET chart_account_id = _chart_id
         WHERE id = _existing_id AND chart_account_id IS NULL;
      END IF;
    ELSE
      INSERT INTO public.categories (
        user_id, company_id, parent_id, name, transaction_type, context,
        sort_order, is_system, visible_pf,
        template_code, category_subtype, ai_description, previous_index,
        is_customizable, is_active, chart_account_id
      ) VALUES (
        _owner, _company_id, _parent_id, _tpl.name, _tpl.transaction_type, 'pj',
        _tpl.sort_order, false, false,
        _tpl.code, _tpl.subtype, _tpl.ai_description, _tpl.previous_index,
        _tpl.is_customizable, true, _chart_id
      )
      RETURNING id INTO _new_id;
      _created := _created + 1;

      INSERT INTO public.category_companies (category_id, company_id)
      VALUES (_new_id, _company_id)
      ON CONFLICT DO NOTHING;
    END IF;

    _map := _map || jsonb_build_object(_tpl.code, _new_id::text);
  END LOOP;

  RETURN jsonb_build_object('created', _created, 'skipped', _skipped);
END;
$function$;

CREATE OR REPLACE FUNCTION public.seed_default_categories_on_company()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _tpl record;
  _parent_id uuid;
  _new_id uuid;
  _existing_id uuid;
  _chart_id uuid;
  _map jsonb := '{}'::jsonb;
BEGIN
  BEGIN
    FOR _tpl IN
      SELECT * FROM public.category_templates ORDER BY level ASC, sort_order ASC
    LOOP
      _parent_id := NULL;
      IF _tpl.parent_code IS NOT NULL THEN
        _parent_id := NULLIF(_map->>_tpl.parent_code, '')::uuid;
      END IF;

      _chart_id := NULL;
      IF _tpl.chart_account_code IS NOT NULL THEN
        SELECT ca.id INTO _chart_id
          FROM public.chart_accounts ca
          JOIN public.chart_account_companies cac
            ON cac.chart_account_id = ca.id AND cac.company_id = NEW.id
         WHERE ca.code = _tpl.chart_account_code
         LIMIT 1;
      END IF;

      SELECT id INTO _existing_id FROM public.categories
       WHERE user_id = NEW.user_id AND company_id = NEW.id AND template_code = _tpl.code
       LIMIT 1;

      IF _existing_id IS NOT NULL THEN
        _new_id := _existing_id;
      ELSE
        INSERT INTO public.categories (
          user_id, company_id, parent_id, name, transaction_type, context,
          sort_order, is_system, visible_pf,
          template_code, category_subtype, ai_description, previous_index,
          is_customizable, is_active, chart_account_id
        ) VALUES (
          NEW.user_id, NEW.id, _parent_id, _tpl.name, _tpl.transaction_type, 'pj',
          _tpl.sort_order, false, false,
          _tpl.code, _tpl.subtype, _tpl.ai_description, _tpl.previous_index,
          _tpl.is_customizable, true, _chart_id
        )
        RETURNING id INTO _new_id;

        INSERT INTO public.category_companies (category_id, company_id)
        VALUES (_new_id, NEW.id)
        ON CONFLICT DO NOTHING;
      END IF;

      _map := _map || jsonb_build_object(_tpl.code, _new_id::text);
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'seed_default_categories_on_company failed for company %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.category_templates_apply_chart_accounts(_overwrite boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _updated int := 0;
BEGIN
  IF _uid IS NULL OR NOT public.is_super_admin(_uid) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  WITH pairs AS (
    SELECT c.id AS category_id, ca.id AS chart_account_id
      FROM public.categories c
      JOIN public.category_templates t ON t.code = c.template_code
      JOIN public.chart_account_companies cac ON cac.company_id = c.company_id
      JOIN public.chart_accounts ca
        ON ca.id = cac.chart_account_id AND ca.code = t.chart_account_code
     WHERE t.chart_account_code IS NOT NULL
       AND c.company_id IS NOT NULL
       AND (_overwrite OR c.chart_account_id IS NULL)
  ), upd AS (
    UPDATE public.categories c
       SET chart_account_id = p.chart_account_id
      FROM pairs p
     WHERE c.id = p.category_id
       AND c.chart_account_id IS DISTINCT FROM p.chart_account_id
    RETURNING 1
  )
  SELECT count(*)::int INTO _updated FROM upd;

  RETURN _updated;
END;
$function$;

REVOKE ALL ON FUNCTION public.category_templates_apply_chart_accounts(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.category_templates_apply_chart_accounts(boolean) TO authenticated;