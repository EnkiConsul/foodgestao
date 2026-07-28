
-- SLO snapshot
CREATE OR REPLACE FUNCTION public.pluggy_v2_slo_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'generated_at', v_now,
    'webhook', (
      SELECT jsonb_build_object(
        'pending', COUNT(*) FILTER (WHERE status = 'pending'),
        'processing', COUNT(*) FILTER (WHERE status = 'processing'),
        'dead_letter', COUNT(*) FILTER (WHERE status = 'dead_letter'),
        'error_last_hour', COUNT(*) FILTER (WHERE status = 'error' AND last_attempt_at >= v_now - interval '1 hour'),
        'success_last_hour', COUNT(*) FILTER (WHERE status = 'success' AND processed_at >= v_now - interval '1 hour'),
        'oldest_pending_age_seconds', EXTRACT(EPOCH FROM (v_now - MIN(received_at) FILTER (WHERE status = 'pending'))),
        'expired_claims', COUNT(*) FILTER (WHERE status = 'processing' AND claim_expires_at IS NOT NULL AND claim_expires_at < v_now)
      )
      FROM public.pluggy_v2_webhook_events
    ),
    'sync_runs', (
      SELECT jsonb_build_object(
        'running', COUNT(*) FILTER (WHERE status = 'running'),
        'pending', COUNT(*) FILTER (WHERE status = 'pending'),
        'dead_letter', COUNT(*) FILTER (WHERE status = 'dead_letter'),
        'error_last_hour', COUNT(*) FILTER (WHERE status = 'error' AND updated_at >= v_now - interval '1 hour'),
        'success_last_hour', COUNT(*) FILTER (WHERE status = 'success' AND finished_at >= v_now - interval '1 hour'),
        'stuck_running', COUNT(*) FILTER (WHERE status = 'running' AND started_at IS NOT NULL AND started_at < v_now - interval '15 minutes')
      )
      FROM public.pluggy_v2_sync_runs
    ),
    'connections', (
      SELECT jsonb_build_object(
        'total', COUNT(*),
        'in_error', COUNT(*) FILTER (WHERE status IN ('login_error','error','outdated')),
        'never_synced', COUNT(*) FILTER (WHERE last_synced_at IS NULL AND status NOT IN ('deleted'))
      )
      FROM public.pluggy_v2_connections
      WHERE status <> 'deleted'
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.pluggy_v2_slo_snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pluggy_v2_slo_snapshot() TO authenticated, service_role;

-- Alerts registry
CREATE TABLE IF NOT EXISTS public.pluggy_v2_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  alert_key TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  message TEXT NOT NULL,
  metric_value NUMERIC,
  threshold NUMERIC,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  notified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pv2_alerts_key_open
  ON public.pluggy_v2_alerts (alert_key, notified_at DESC)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pv2_alerts_recent
  ON public.pluggy_v2_alerts (notified_at DESC);

GRANT SELECT ON public.pluggy_v2_alerts TO authenticated;
GRANT ALL ON public.pluggy_v2_alerts TO service_role;

ALTER TABLE public.pluggy_v2_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins can view alerts" ON public.pluggy_v2_alerts;
CREATE POLICY "Super admins can view alerts"
  ON public.pluggy_v2_alerts FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "Service role manages alerts" ON public.pluggy_v2_alerts;
CREATE POLICY "Service role manages alerts"
  ON public.pluggy_v2_alerts FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_pv2_alerts_updated_at ON public.pluggy_v2_alerts;
CREATE TRIGGER trg_pv2_alerts_updated_at
  BEFORE UPDATE ON public.pluggy_v2_alerts
  FOR EACH ROW EXECUTE FUNCTION public.pluggy_v2_set_updated_at();
