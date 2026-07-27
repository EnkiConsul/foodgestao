-- Bloco 9: cron jobs de resiliência do Open Finance

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
      AND (c.last_synced_at IS NULL OR c.last_synced_at < now() - interval '12 hours')
  )
  INSERT INTO public.open_finance_sync_runs (connection_id, company_id, status, triggered_by, queued_at)
  SELECT id, company_id, 'queued', 'cron', now() FROM candidates;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_open_finance_scheduled_syncs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_open_finance_scheduled_syncs() TO service_role;

CREATE OR REPLACE FUNCTION public.reap_open_finance_stuck_runs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  UPDATE public.open_finance_sync_runs
  SET status = CASE
        WHEN COALESCE(attempt_count, 0) >= COALESCE(max_attempts, 3) THEN 'error'
        ELSE 'queued'
      END,
      error = COALESCE(error, 'stuck_run_reaped'),
      claimed_by = NULL,
      claim_expires_at = NULL,
      next_attempt_at = now(),
      finished_at = CASE
        WHEN COALESCE(attempt_count, 0) >= COALESCE(max_attempts, 3) THEN now()
        ELSE NULL
      END,
      updated_at = now()
  WHERE status = 'running'
    AND claim_expires_at IS NOT NULL
    AND claim_expires_at < now() - interval '5 minutes';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.reap_open_finance_stuck_runs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reap_open_finance_stuck_runs() TO service_role;

CREATE OR REPLACE FUNCTION public.cleanup_open_finance_artifacts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_events integer := 0;
  v_runs integer := 0;
BEGIN
  DELETE FROM public.open_finance_webhook_events
  WHERE created_at < now() - interval '30 days'
    AND processed_at IS NOT NULL;
  GET DIAGNOSTICS v_events = ROW_COUNT;

  DELETE FROM public.open_finance_sync_runs
  WHERE created_at < now() - interval '90 days'
    AND status IN ('success', 'error');
  GET DIAGNOSTICS v_runs = ROW_COUNT;

  RETURN jsonb_build_object('webhook_events_deleted', v_events, 'sync_runs_deleted', v_runs);
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_open_finance_artifacts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_open_finance_artifacts() TO service_role;

-- Agendamentos (apenas chamadas internas, sem segredos)
SELECT cron.unschedule('pluggy-daily-sync')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pluggy-daily-sync');

SELECT cron.unschedule('pluggy-enqueue-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pluggy-enqueue-daily');
SELECT cron.schedule('pluggy-enqueue-daily', '0 5 * * *', $cron$ SELECT public.enqueue_open_finance_scheduled_syncs(); $cron$);

SELECT cron.unschedule('pluggy-reap-stuck-runs')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pluggy-reap-stuck-runs');
SELECT cron.schedule('pluggy-reap-stuck-runs', '*/10 * * * *', $cron$ SELECT public.reap_open_finance_stuck_runs(); $cron$);

SELECT cron.unschedule('pluggy-cleanup-weekly')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pluggy-cleanup-weekly');
SELECT cron.schedule('pluggy-cleanup-weekly', '30 4 * * 0', $cron$ SELECT public.cleanup_open_finance_artifacts(); $cron$);