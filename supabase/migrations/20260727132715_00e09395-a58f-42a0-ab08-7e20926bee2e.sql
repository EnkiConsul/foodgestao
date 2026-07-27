CREATE OR REPLACE FUNCTION public.open_finance_sync_health(_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF NOT (
    public.has_role(v_uid, 'super_admin'::app_role)
    OR public.is_company_admin_or_owner(v_uid, _company_id)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
    'connections_active', (
      SELECT count(*) FROM public.open_finance_connections c
      WHERE c.company_id = _company_id AND c.disconnected_at IS NULL
    ),
    'connections_needing_action', (
      SELECT count(*) FROM public.open_finance_connections c
      WHERE c.company_id = _company_id AND c.disconnected_at IS NULL
        AND COALESCE(c.requires_user_action, false) = true
    ),
    'runs_queued', (
      SELECT count(*) FROM public.open_finance_sync_runs r
      WHERE r.company_id = _company_id AND r.status = 'queued'
    ),
    'runs_running', (
      SELECT count(*) FROM public.open_finance_sync_runs r
      WHERE r.company_id = _company_id AND r.status = 'running'
    ),
    'runs_error_24h', (
      SELECT count(*) FROM public.open_finance_sync_runs r
      WHERE r.company_id = _company_id AND r.status = 'error'
        AND r.created_at > now() - interval '24 hours'
    ),
    'runs_success_24h', (
      SELECT count(*) FROM public.open_finance_sync_runs r
      WHERE r.company_id = _company_id AND r.status = 'success'
        AND r.created_at > now() - interval '24 hours'
    ),
    'last_synced_at', (
      SELECT max(c.last_synced_at) FROM public.open_finance_connections c
      WHERE c.company_id = _company_id
    ),
    'pending_reconciliation', (
      SELECT count(*) FROM public.open_finance_transactions_raw t
      WHERE t.company_id = _company_id AND t.transaction_id IS NULL
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.open_finance_sync_health(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_finance_sync_health(uuid) TO authenticated;