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
      WITH upd AS (
        UPDATE public.transactions
           SET category_id = NULL
         WHERE category_id = ANY(_ids)
        RETURNING 1
      )
      SELECT count(*)::int INTO _detached FROM upd;

      UPDATE public.pluggy_staging_transactions
         SET suggested_category_id = NULL
       WHERE suggested_category_id = ANY(_ids);

      UPDATE public.dp_folha_lancamentos
         SET financeiro_categoria_id = NULL
       WHERE financeiro_categoria_id = ANY(_ids);

      DELETE FROM public.budgets WHERE category_id = ANY(_ids);
      DELETE FROM public.categorization_rules WHERE category_id = ANY(_ids);
      DELETE FROM public.import_rules WHERE category_id = ANY(_ids);
      DELETE FROM public.category_companies WHERE category_id = ANY(_ids);

      UPDATE public.categories SET parent_id = NULL WHERE id = ANY(_ids);

      WITH del AS (
        DELETE FROM public.categories WHERE id = ANY(_ids) RETURNING 1
      )
      SELECT count(*)::int INTO _deleted FROM del;
    END IF;
  END IF;

  _seed := public.seed_default_categories(_company_id);
  RETURN jsonb_build_object('replaced', _replace_existing, 'detached', _detached, 'deleted', _deleted, 'seed', _seed);
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_default_categories(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.apply_default_categories(uuid, boolean) TO authenticated;