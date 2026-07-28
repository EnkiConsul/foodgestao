CREATE OR REPLACE FUNCTION public.pluggy_expire_stale_connect_requests()
RETURNS TABLE(expired_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH upd AS (
    UPDATE public.open_finance_connection_requests
       SET status = 'expired',
           error_code = COALESCE(error_code, 'connect_token_expired'),
           updated_at = now()
     WHERE status = 'token_created'
       AND pluggy_item_id IS NULL
       AND created_at < now() - interval '30 minutes'
    RETURNING id
  )
  SELECT count(*)::int INTO v_count FROM upd;
  expired_count := v_count;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.pluggy_expire_stale_connect_requests() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pluggy_expire_stale_connect_requests() TO service_role;