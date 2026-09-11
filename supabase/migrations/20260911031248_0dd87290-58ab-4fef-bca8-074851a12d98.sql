CREATE OR REPLACE FUNCTION public.dp_refresh_my_company_pending(p_company_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE v_time timestamptz := now();
BEGIN
  IF (SELECT auth.role()) <> 'service_role' THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  PERFORM private.dp_refresh_document_pending(p_company_id);
  RETURN v_time;
END;
$$;
REVOKE ALL ON FUNCTION public.dp_refresh_my_company_pending(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_refresh_my_company_pending(uuid) TO service_role;