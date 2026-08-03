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
      UPDATE public.categories
         SET chart_account_id = COALESCE(chart_account_id, _chart_id),
             guidance_include = _tpl.guidance_include,
             guidance_exclude = _tpl.guidance_exclude,
             keywords = _tpl.keywords,
             examples = _tpl.examples,
             in_dre = _tpl.in_dre,
             is_contribution_margin = _tpl.is_contribution_margin,
             is_cmv = _tpl.is_cmv,
             is_patrimonial = _tpl.is_patrimonial
       WHERE id = _existing_id;
    ELSE
      INSERT INTO public.categories (
        user_id, company_id, parent_id, name, transaction_type, context,
        sort_order, is_system, visible_pf,
        template_code, category_subtype, ai_description, previous_index,
        is_customizable, is_active, chart_account_id,
        guidance_include, guidance_exclude, keywords, examples,
        in_dre, is_contribution_margin, is_cmv, is_patrimonial
      ) VALUES (
        _owner, _company_id, _parent_id, _tpl.name, _tpl.transaction_type, 'pj',
        _tpl.sort_order, false, false,
        _tpl.code, _tpl.subtype, _tpl.ai_description, _tpl.previous_index,
        _tpl.is_customizable, true, _chart_id,
        _tpl.guidance_include, _tpl.guidance_exclude, _tpl.keywords, _tpl.examples,
        _tpl.in_dre, _tpl.is_contribution_margin, _tpl.is_cmv, _tpl.is_patrimonial
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

CREATE OR REPLACE FUNCTION public.apply_default_categories(_company_id uuid, _replace_existing boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _owner uuid;
  _ids uuid[];
  _detached int := 0;
  _deleted int := 0;
  _seed jsonb;
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

  IF _replace_existing THEN
    SELECT array_agg(id) INTO _ids
      FROM public.categories
     WHERE company_id = _company_id;

    IF _ids IS NOT NULL AND array_length(_ids, 1) > 0 THEN
      UPDATE public.transactions
         SET category_id = NULL
       WHERE category_id = ANY(_ids);
      _detached := ROW_COUNT_HACK();
    END IF;
  END IF;

  _seed := public.seed_default_categories(_company_id);
  RETURN jsonb_build_object('replaced', _replace_existing, 'detached', _detached, 'deleted', _deleted, 'seed', _seed);
END;
$function$;