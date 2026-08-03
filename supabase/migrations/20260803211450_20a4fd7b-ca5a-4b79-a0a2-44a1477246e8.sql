CREATE OR REPLACE FUNCTION public.preview_default_categories(_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _owner uuid;
  _own_ids uuid[];
  _linked_ids uuid[];
  _all_ids uuid[];
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

  SELECT array_agg(id) INTO _own_ids
    FROM public.categories
   WHERE company_id = _company_id;

  SELECT array_agg(DISTINCT cc.category_id) INTO _linked_ids
    FROM public.category_companies cc
    JOIN public.categories c ON c.id = cc.category_id
   WHERE cc.company_id = _company_id
     AND (c.company_id IS DISTINCT FROM _company_id);

  _all_ids := COALESCE(_own_ids, '{}'::uuid[]) || COALESCE(_linked_ids, '{}'::uuid[]);

  RETURN jsonb_build_object(
    'will_delete', COALESCE(array_length(_own_ids, 1), 0),
    'will_unlink', COALESCE(array_length(_linked_ids, 1), 0),
    'transactions_detached', (
      SELECT count(*)::int FROM public.transactions
       WHERE category_id = ANY(_all_ids)
    ),
    'staging_detached', (
      SELECT count(*)::int FROM public.pluggy_staging_transactions
       WHERE suggested_category_id = ANY(_all_ids)
    ),
    'folha_detached', (
      SELECT count(*)::int FROM public.dp_folha_lancamentos
       WHERE financeiro_categoria_id = ANY(_all_ids)
    ),
    'budgets_deleted', (
      SELECT count(*)::int FROM public.budgets
       WHERE category_id = ANY(_all_ids)
    ),
    'rules_deleted', (
      SELECT count(*)::int FROM public.categorization_rules
       WHERE category_id = ANY(_all_ids)
    ) + (
      SELECT count(*)::int FROM public.import_rules
       WHERE category_id = ANY(_all_ids)
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.preview_default_categories(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_default_categories(uuid) TO authenticated;