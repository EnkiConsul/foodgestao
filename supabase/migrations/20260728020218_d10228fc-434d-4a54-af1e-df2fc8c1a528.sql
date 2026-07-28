
-- Claim atômico: reserva até N eventos elegíveis
CREATE OR REPLACE FUNCTION public.pluggy_webhook_claim(
  p_worker_id text,
  p_batch_size integer DEFAULT 5,
  p_lease_seconds integer DEFAULT 60
)
RETURNS SETOF public.open_finance_webhook_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_worker_id IS NULL OR length(p_worker_id) = 0 THEN
    RAISE EXCEPTION 'worker_id required';
  END IF;
  IF p_batch_size IS NULL OR p_batch_size < 1 OR p_batch_size > 50 THEN
    p_batch_size := 5;
  END IF;
  IF p_lease_seconds IS NULL OR p_lease_seconds < 10 THEN
    p_lease_seconds := 60;
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT id
      FROM public.open_finance_webhook_events
     WHERE (
             (status IN ('pending','retry')
               AND (next_attempt_at IS NULL OR next_attempt_at <= now()))
             OR (status = 'processing'
                 AND claim_expires_at IS NOT NULL
                 AND claim_expires_at <= now())
           )
     ORDER BY COALESCE(next_attempt_at, created_at) ASC
     LIMIT p_batch_size
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.open_finance_webhook_events e
     SET status = 'processing',
         claimed_by = p_worker_id,
         claim_expires_at = now() + make_interval(secs => p_lease_seconds),
         last_attempt_at = now(),
         attempt_count = e.attempt_count + 1
    FROM candidates c
   WHERE e.id = c.id
  RETURNING e.*;
END;
$$;

-- Finaliza com sucesso, só se ainda for o dono da reserva
CREATE OR REPLACE FUNCTION public.pluggy_webhook_finalize_success(
  p_event_id uuid,
  p_worker_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.open_finance_webhook_events
     SET status = 'processed',
         processed_at = now(),
         error = NULL,
         last_error_code = NULL,
         claimed_by = NULL,
         claim_expires_at = NULL,
         next_attempt_at = NULL
   WHERE id = p_event_id
     AND status = 'processing'
     AND claimed_by = p_worker_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

-- Finaliza com falha: retry com backoff exponencial ou dead_letter
CREATE OR REPLACE FUNCTION public.pluggy_webhook_finalize_failure(
  p_event_id uuid,
  p_worker_id text,
  p_error text,
  p_error_code text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.open_finance_webhook_events%ROWTYPE;
  v_delay_seconds integer;
  v_new_status text;
BEGIN
  SELECT * INTO v_row
    FROM public.open_finance_webhook_events
   WHERE id = p_event_id
     AND status = 'processing'
     AND claimed_by = p_worker_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_row.attempt_count >= v_row.max_attempts THEN
    v_new_status := 'dead_letter';
    v_delay_seconds := NULL;
  ELSE
    v_new_status := 'retry';
    -- backoff exponencial: 30s, 60s, 120s, 240s ... teto 30min
    v_delay_seconds := LEAST(30 * power(2, GREATEST(v_row.attempt_count - 1, 0))::int, 1800);
  END IF;

  UPDATE public.open_finance_webhook_events
     SET status = v_new_status,
         error = left(coalesce(p_error, 'unknown error'), 2000),
         last_error_code = p_error_code,
         claimed_by = NULL,
         claim_expires_at = NULL,
         next_attempt_at = CASE
           WHEN v_delay_seconds IS NULL THEN NULL
           ELSE now() + make_interval(secs => v_delay_seconds)
         END
   WHERE id = p_event_id;

  RETURN v_new_status;
END;
$$;

-- Painel de saúde: agregados por status + backlog
CREATE OR REPLACE FUNCTION public.pluggy_webhook_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'by_status', COALESCE((
      SELECT jsonb_object_agg(status, cnt)
        FROM (
          SELECT status, count(*)::int AS cnt
            FROM public.open_finance_webhook_events
           GROUP BY status
        ) s
    ), '{}'::jsonb),
    'ready_now', (
      SELECT count(*)::int
        FROM public.open_finance_webhook_events
       WHERE status IN ('pending','retry')
         AND (next_attempt_at IS NULL OR next_attempt_at <= now())
    ),
    'expired_leases', (
      SELECT count(*)::int
        FROM public.open_finance_webhook_events
       WHERE status = 'processing'
         AND claim_expires_at IS NOT NULL
         AND claim_expires_at <= now()
    ),
    'oldest_pending_seconds', (
      SELECT COALESCE(EXTRACT(EPOCH FROM (now() - min(created_at)))::int, 0)
        FROM public.open_finance_webhook_events
       WHERE status IN ('pending','retry')
    ),
    'dead_letter_last_24h', (
      SELECT count(*)::int
        FROM public.open_finance_webhook_events
       WHERE status = 'dead_letter'
         AND coalesce(last_attempt_at, created_at) >= now() - interval '24 hours'
    ),
    'checked_at', now()
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Restringir execução ao service_role
REVOKE ALL ON FUNCTION public.pluggy_webhook_claim(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pluggy_webhook_finalize_success(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pluggy_webhook_finalize_failure(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pluggy_webhook_health() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.pluggy_webhook_claim(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.pluggy_webhook_finalize_success(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.pluggy_webhook_finalize_failure(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.pluggy_webhook_health() TO service_role;
