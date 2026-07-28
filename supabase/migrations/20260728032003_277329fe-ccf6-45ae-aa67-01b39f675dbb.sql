-- =========================================================
-- FASE 2 — RPCs ATÔMICAS DO WORKER V2
-- =========================================================

-- ---------- WORKER DE WEBHOOKS ----------

-- Claim atômico com lease
CREATE OR REPLACE FUNCTION public.pluggy_v2_webhook_claim(
  p_worker_id TEXT,
  p_batch_size INTEGER DEFAULT 10,
  p_lease_seconds INTEGER DEFAULT 120
) RETURNS SETOF public.pluggy_v2_webhook_events
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT id
    FROM public.pluggy_v2_webhook_events
    WHERE (
        (status = 'pending' AND next_attempt_at <= now())
        OR (status = 'processing' AND claim_expires_at IS NOT NULL AND claim_expires_at < now())
      )
      AND attempts < max_attempts
    ORDER BY next_attempt_at ASC NULLS FIRST, created_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.pluggy_v2_webhook_events e
     SET status = 'processing',
         claimed_by = p_worker_id,
         claim_expires_at = now() + make_interval(secs => p_lease_seconds),
         last_attempt_at = now(),
         attempts = e.attempts + 1,
         updated_at = now()
    FROM candidates c
   WHERE e.id = c.id
   RETURNING e.*;
END; $$;

-- Finaliza com sucesso
CREATE OR REPLACE FUNCTION public.pluggy_v2_webhook_finalize_success(
  p_event_id UUID,
  p_worker_id TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ok BOOLEAN;
BEGIN
  UPDATE public.pluggy_v2_webhook_events
     SET status = 'success',
         processed_at = now(),
         claim_expires_at = NULL,
         last_error = NULL,
         updated_at = now()
   WHERE id = p_event_id
     AND claimed_by = p_worker_id
     AND status = 'processing'
  RETURNING true INTO v_ok;
  RETURN COALESCE(v_ok, false);
END; $$;

-- Finaliza com falha + backoff exponencial ou dead-letter
CREATE OR REPLACE FUNCTION public.pluggy_v2_webhook_finalize_failure(
  p_event_id UUID,
  p_worker_id TEXT,
  p_error TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.pluggy_v2_webhook_events%ROWTYPE;
  v_delay_seconds INTEGER;
BEGIN
  SELECT * INTO v_row FROM public.pluggy_v2_webhook_events
   WHERE id = p_event_id AND claimed_by = p_worker_id AND status = 'processing'
   FOR UPDATE;

  IF NOT FOUND THEN RETURN false; END IF;

  IF v_row.attempts >= v_row.max_attempts THEN
    UPDATE public.pluggy_v2_webhook_events
       SET status = 'dead_letter',
           claim_expires_at = NULL,
           last_error = p_error,
           updated_at = now()
     WHERE id = p_event_id;
  ELSE
    -- backoff exponencial: 30s * 2^attempts, cap em 1h
    v_delay_seconds := LEAST(3600, 30 * POWER(2, v_row.attempts)::INTEGER);
    UPDATE public.pluggy_v2_webhook_events
       SET status = 'pending',
           claim_expires_at = NULL,
           claimed_by = NULL,
           last_error = p_error,
           next_attempt_at = now() + make_interval(secs => v_delay_seconds),
           updated_at = now()
     WHERE id = p_event_id;
  END IF;

  RETURN true;
END; $$;

-- Health metrics
CREATE OR REPLACE FUNCTION public.pluggy_v2_webhook_health()
RETURNS TABLE(
  pending_count BIGINT,
  processing_count BIGINT,
  success_last_24h BIGINT,
  error_last_24h BIGINT,
  dead_letter_count BIGINT,
  oldest_pending_age_seconds NUMERIC,
  oldest_processing_age_seconds NUMERIC
) LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (SELECT count(*) FROM public.pluggy_v2_webhook_events WHERE status = 'pending'),
    (SELECT count(*) FROM public.pluggy_v2_webhook_events WHERE status = 'processing'),
    (SELECT count(*) FROM public.pluggy_v2_webhook_events WHERE status = 'success' AND processed_at > now() - interval '24 hours'),
    (SELECT count(*) FROM public.pluggy_v2_webhook_events WHERE status = 'error' AND updated_at > now() - interval '24 hours'),
    (SELECT count(*) FROM public.pluggy_v2_webhook_events WHERE status = 'dead_letter'),
    (SELECT EXTRACT(EPOCH FROM (now() - MIN(created_at))) FROM public.pluggy_v2_webhook_events WHERE status = 'pending'),
    (SELECT EXTRACT(EPOCH FROM (now() - MIN(last_attempt_at))) FROM public.pluggy_v2_webhook_events WHERE status = 'processing');
$$;

-- ---------- CICLO DE CONEXÕES ----------

-- Expira solicitações órfãs
CREATE OR REPLACE FUNCTION public.pluggy_v2_expire_stale_requests()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count INTEGER;
BEGIN
  UPDATE public.pluggy_v2_connect_requests
     SET status = 'expired',
         last_error = COALESCE(last_error, 'expired_by_cleanup'),
         updated_at = now()
   WHERE status IN ('token_created','item_linked')
     AND expires_at < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END; $$;

-- Claim de deleção remota
CREATE OR REPLACE FUNCTION public.pluggy_v2_claim_remote_deletion(
  p_worker_id TEXT,
  p_batch_size INTEGER DEFAULT 5,
  p_lease_seconds INTEGER DEFAULT 60
) RETURNS SETOF public.pluggy_v2_connections
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT id FROM public.pluggy_v2_connections
     WHERE remote_deletion_status IN ('pending','failed')
       AND (remote_deletion_next_at IS NULL OR remote_deletion_next_at <= now())
       AND remote_deletion_attempts < 8
     ORDER BY remote_deletion_next_at ASC NULLS FIRST
     LIMIT p_batch_size
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.pluggy_v2_connections c
     SET remote_deletion_status = 'processing',
         remote_deletion_next_at = now() + make_interval(secs => p_lease_seconds),
         remote_deletion_attempts = c.remote_deletion_attempts + 1,
         updated_at = now()
    FROM candidates x
   WHERE c.id = x.id
   RETURNING c.*;
END; $$;

-- Finaliza deleção remota
CREATE OR REPLACE FUNCTION public.pluggy_v2_finalize_remote_deletion(
  p_connection_id UUID,
  p_success BOOLEAN,
  p_error TEXT DEFAULT NULL
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.pluggy_v2_connections%ROWTYPE;
  v_delay INTEGER;
BEGIN
  SELECT * INTO v_row FROM public.pluggy_v2_connections
   WHERE id = p_connection_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  IF p_success THEN
    UPDATE public.pluggy_v2_connections
       SET remote_deletion_status = 'done',
           remote_deletion_last_error = NULL,
           deleted_at = COALESCE(deleted_at, now()),
           updated_at = now()
     WHERE id = p_connection_id;
  ELSIF v_row.remote_deletion_attempts >= 8 THEN
    UPDATE public.pluggy_v2_connections
       SET remote_deletion_status = 'dead_letter',
           remote_deletion_last_error = p_error,
           updated_at = now()
     WHERE id = p_connection_id;
  ELSE
    v_delay := LEAST(3600, 60 * POWER(2, v_row.remote_deletion_attempts)::INTEGER);
    UPDATE public.pluggy_v2_connections
       SET remote_deletion_status = 'failed',
           remote_deletion_last_error = p_error,
           remote_deletion_next_at = now() + make_interval(secs => v_delay),
           updated_at = now()
     WHERE id = p_connection_id;
  END IF;
  RETURN true;
END; $$;

-- ---------- LOCKDOWN DE PERMISSÕES ----------
REVOKE ALL ON FUNCTION public.pluggy_v2_webhook_claim(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pluggy_v2_webhook_finalize_success(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pluggy_v2_webhook_finalize_failure(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pluggy_v2_expire_stale_requests() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pluggy_v2_claim_remote_deletion(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pluggy_v2_finalize_remote_deletion(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.pluggy_v2_webhook_claim(TEXT, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.pluggy_v2_webhook_finalize_success(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.pluggy_v2_webhook_finalize_failure(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.pluggy_v2_expire_stale_requests() TO service_role;
GRANT EXECUTE ON FUNCTION public.pluggy_v2_claim_remote_deletion(TEXT, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.pluggy_v2_finalize_remote_deletion(UUID, BOOLEAN, TEXT) TO service_role;

-- health é lida no painel super_admin
REVOKE ALL ON FUNCTION public.pluggy_v2_webhook_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pluggy_v2_webhook_health() TO authenticated, service_role;