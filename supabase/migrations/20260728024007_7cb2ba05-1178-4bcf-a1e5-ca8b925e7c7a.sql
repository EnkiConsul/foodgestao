
CREATE OR REPLACE FUNCTION public.pluggy_purge_expired_connect_tokens()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE v_count integer := 0;
BEGIN
  UPDATE public.open_finance_connection_requests
     SET metadata = metadata - 'access_token'
   WHERE metadata ? 'access_token'
     AND token_expires_at IS NOT NULL
     AND token_expires_at < now() - interval '5 minutes';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.pluggy_purge_expired_connect_tokens() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pluggy_purge_expired_connect_tokens() TO service_role;

CREATE OR REPLACE FUNCTION public.cleanup_open_finance_artifacts()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_events integer := 0;
  v_runs integer := 0;
  v_tokens integer := 0;
BEGIN
  DELETE FROM public.open_finance_webhook_events
  WHERE created_at < now() - interval '30 days'
    AND processed_at IS NOT NULL;
  GET DIAGNOSTICS v_events = ROW_COUNT;

  DELETE FROM public.open_finance_sync_runs
  WHERE created_at < now() - interval '90 days'
    AND status IN ('success', 'error');
  GET DIAGNOSTICS v_runs = ROW_COUNT;

  v_tokens := public.pluggy_purge_expired_connect_tokens();

  RETURN jsonb_build_object(
    'webhook_events_deleted', v_events,
    'sync_runs_deleted', v_runs,
    'connect_tokens_purged', v_tokens
  );
END;
$function$;
