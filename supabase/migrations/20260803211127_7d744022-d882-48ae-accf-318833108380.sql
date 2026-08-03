CREATE OR REPLACE FUNCTION public.apply_default_categories(_company_id uuid, _replace_existing boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _owner uuid;
  _own_ids uuid[];
  _linked_ids uuid[];
  _all_ids uuid[];
  _detached int := 0;
  _unlinked int := 0;
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
    -- Categorias que pertencem a esta empresa (podem ser excluídas)
    SELECT array_agg(id) INTO _own_ids
      FROM public.categories
     WHERE company_id = _company_id;

    -- Categorias de outra origem, apenas compartilhadas com esta empresa:
    -- não são excluídas, apenas desvinculadas.
    SELECT array_agg(DISTINCT cc.category_id) INTO _linked_ids
      FROM public.category_companies cc
      JOIN public.categories c ON c.id = cc.category_id
     WHERE cc.company_id = _company_id
       AND (c.company_id IS DISTINCT FROM _company_id);

    _all_ids := COALESCE(_own_ids, '{}'::uuid[]) || COALESCE(_linked_ids, '{}'::uuid[]);

    IF array_length(_all_ids, 1) > 0 THEN
      -- Lançamentos SEMPRE são preservados: apenas perdem o vínculo com a categoria.
      WITH upd AS (
        UPDATE public.transactions
           SET category_id = NULL
         WHERE category_id = ANY(_all_ids)
        RETURNING 1
      )
      SELECT count(*)::int INTO _detached FROM upd;

      UPDATE public.pluggy_staging_transactions
         SET suggested_category_id = NULL
       WHERE suggested_category_id = ANY(_all_ids);

      UPDATE public.dp_folha_lancamentos
         SET financeiro_categoria_id = NULL
       WHERE financeiro_categoria_id = ANY(_all_ids);

      DELETE FROM public.budgets WHERE category_id = ANY(_all_ids);
      DELETE FROM public.categorization_rules WHERE category_id = ANY(_all_ids);
      DELETE FROM public.import_rules WHERE category_id = ANY(_all_ids);
    END IF;

    -- Categorias compartilhadas: somente remover o vínculo com esta empresa.
    IF _linked_ids IS NOT NULL AND array_length(_linked_ids, 1) > 0 THEN
      WITH unl AS (
        DELETE FROM public.category_companies
         WHERE company_id = _company_id
           AND category_id = ANY(_linked_ids)
        RETURNING 1
      )
      SELECT count(*)::int INTO _unlinked FROM unl;
    END IF;

    -- Categorias próprias: remover de fato.
    IF _own_ids IS NOT NULL AND array_length(_own_ids, 1) > 0 THEN
      DELETE FROM public.category_companies WHERE category_id = ANY(_own_ids);
      UPDATE public.categories SET parent_id = NULL WHERE id = ANY(_own_ids);

      WITH del AS (
        DELETE FROM public.categories WHERE id = ANY(_own_ids) RETURNING 1
      )
      SELECT count(*)::int INTO _deleted FROM del;
    END IF;
  END IF;

  _seed := public.seed_default_categories(_company_id);
  RETURN jsonb_build_object(
    'replaced', _replace_existing,
    'detached', _detached,
    'unlinked', _unlinked,
    'deleted', _deleted,
    'seed', _seed
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_default_categories(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.apply_default_categories(uuid, boolean) TO authenticated;