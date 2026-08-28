CREATE OR REPLACE FUNCTION public.pluggy_mark_duplicate_staging(p_staging_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user UUID := auth.uid();
  v_count INTEGER;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  UPDATE public.pluggy_staging_transactions s
  SET status = 'duplicate', updated_at = now()
  WHERE s.id = ANY(p_staging_ids)
    AND s.status = 'pending'
    AND s.company_id IN (SELECT company_id FROM public.company_members WHERE user_id = v_user);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.pluggy_mark_duplicate_staging(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pluggy_mark_duplicate_staging(uuid[]) TO authenticated;

UPDATE public.pluggy_staging_transactions
SET status = 'duplicate', updated_at = now()
WHERE id = '3822a7d0-7c13-4327-9ccc-34d164026bc9'
  AND status = 'pending';