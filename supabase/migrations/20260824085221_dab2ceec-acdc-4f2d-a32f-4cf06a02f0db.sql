CREATE OR REPLACE FUNCTION public.enqueue_open_finance_scheduled_syncs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  WITH candidates AS (
    SELECT c.id, c.company_id
    FROM public.open_finance_connections c
    WHERE c.disconnected_at IS NULL
      AND COALESCE(c.requires_user_action, false) = false
      AND (c.consent_expires_at IS NULL OR c.consent_expires_at > now())
      AND NOT EXISTS (
        SELECT 1 FROM public.open_finance_sync_runs r
        WHERE r.connection_id = c.id
          AND r.status IN ('queued', 'running')
      )
      AND (c.last_synced_at IS NULL OR c.last_synced_at < now() - interval '6 hours')
  )
  INSERT INTO public.open_finance_sync_runs (connection_id, company_id, status, triggered_by, queued_at)
  SELECT id, company_id, 'queued', 'cron', now() FROM candidates;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_open_finance_scheduled_syncs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_open_finance_scheduled_syncs() TO service_role;