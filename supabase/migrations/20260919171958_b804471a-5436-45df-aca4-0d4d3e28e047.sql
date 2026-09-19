-- Limpar extrato pendente somente nas linhas exibidas na tela (escopo por ids).
-- Rollback: DROP FUNCTION public.pluggy_clear_pending_staging(uuid, uuid[]);
CREATE OR REPLACE FUNCTION public.pluggy_clear_pending_staging(_company_id uuid, _ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_count integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _company_id IS NULL THEN RAISE EXCEPTION 'company_required'; END IF;
  IF NOT COALESCE(private.pluggy_can_edit(v_uid, _company_id), false) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _ids IS NULL OR array_length(_ids, 1) IS NULL THEN RETURN 0; END IF;
  IF array_length(_ids, 1) > 5000 THEN RAISE EXCEPTION 'too_many_ids'; END IF;

  DELETE FROM public.pluggy_staging_transactions
   WHERE company_id = _company_id
     AND status = 'pending'
     AND id = ANY(_ids);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.pluggy_clear_pending_staging(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pluggy_clear_pending_staging(uuid, uuid[]) TO authenticated, service_role;