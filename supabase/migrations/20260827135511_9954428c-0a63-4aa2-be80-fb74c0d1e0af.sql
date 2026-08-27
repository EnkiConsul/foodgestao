-- ============================================================
-- Fila (inbox) por provedor: asaas_webhook_events / pluggy_webhook_events
-- ============================================================

-- 1. Colunas de fila
ALTER TABLE public.asaas_webhook_events
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS locked_by text,
  ADD COLUMN IF NOT EXISTS claim_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS dead_lettered_at timestamptz,
  ADD COLUMN IF NOT EXISTS error_code text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.pluggy_webhook_events
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS locked_by text,
  ADD COLUMN IF NOT EXISTS claim_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS dead_lettered_at timestamptz,
  ADD COLUMN IF NOT EXISTS error_code text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- 2. event_id obrigatório no Pluggy
UPDATE public.pluggy_webhook_events
   SET event_id = 'legacy:' || id::text
 WHERE event_id IS NULL;

ALTER TABLE public.pluggy_webhook_events
  ALTER COLUMN event_id SET NOT NULL;

-- 3. Backfill de situação
UPDATE public.asaas_webhook_events
   SET status = CASE WHEN processed_at IS NOT NULL THEN 'processed' ELSE 'pending' END,
       next_attempt_at = now();

UPDATE public.pluggy_webhook_events
   SET status = CASE WHEN processed_at IS NOT NULL THEN 'processed' ELSE 'pending' END,
       next_attempt_at = now();

-- 4. Restrições de situação
ALTER TABLE public.asaas_webhook_events DROP CONSTRAINT IF EXISTS asaas_webhook_events_status_chk;
ALTER TABLE public.asaas_webhook_events
  ADD CONSTRAINT asaas_webhook_events_status_chk
  CHECK (status = ANY (ARRAY['pending','processing','processed','retry','dead_letter']));

ALTER TABLE public.pluggy_webhook_events DROP CONSTRAINT IF EXISTS pluggy_webhook_events_status_chk;
ALTER TABLE public.pluggy_webhook_events
  ADD CONSTRAINT pluggy_webhook_events_status_chk
  CHECK (status = ANY (ARRAY['pending','processing','processed','retry','dead_letter']));

-- 5. Índices da fila
CREATE INDEX IF NOT EXISTS idx_asaas_webhook_queue
  ON public.asaas_webhook_events (status, next_attempt_at)
  WHERE status IN ('pending','retry');
CREATE INDEX IF NOT EXISTS idx_asaas_webhook_lease
  ON public.asaas_webhook_events (claim_expires_at)
  WHERE status = 'processing';
CREATE INDEX IF NOT EXISTS idx_pluggy_webhook_queue
  ON public.pluggy_webhook_events (status, next_attempt_at)
  WHERE status IN ('pending','retry');
CREATE INDEX IF NOT EXISTS idx_pluggy_webhook_lease
  ON public.pluggy_webhook_events (claim_expires_at)
  WHERE status = 'processing';

-- 6. Funções órfãs da arquitetura anterior
DROP FUNCTION IF EXISTS public.pluggy_webhook_finalize_success(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.pluggy_webhook_finalize_failure(uuid, text, text, text) CASCADE;

-- ============================================================
-- 7. RPCs de fila — ASAAS
-- ============================================================
CREATE OR REPLACE FUNCTION public.asaas_webhook_claim(
  _worker text,
  _batch integer DEFAULT 25,
  _lease_seconds integer DEFAULT 120
)
RETURNS TABLE(id uuid, event_id text, event_type text, payload jsonb, attempt_count integer, max_attempts integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT e.id
      FROM public.asaas_webhook_events e
     WHERE (
             (e.status IN ('pending','retry') AND e.next_attempt_at <= now())
             OR (e.status = 'processing' AND e.claim_expires_at IS NOT NULL AND e.claim_expires_at < now())
           )
       AND e.attempt_count < e.max_attempts
     ORDER BY e.next_attempt_at, e.created_at
     LIMIT GREATEST(COALESCE(_batch, 25), 1)
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.asaas_webhook_events e
     SET status = 'processing',
         locked_by = _worker,
         claim_expires_at = now() + make_interval(secs => GREATEST(COALESCE(_lease_seconds, 120), 10)),
         attempt_count = e.attempt_count + 1,
         updated_at = now()
   WHERE e.id IN (SELECT p.id FROM picked p)
  RETURNING e.id, e.event_id, e.event_type, e.payload, e.attempt_count, e.max_attempts;
END;
$$;

CREATE OR REPLACE FUNCTION public.asaas_webhook_finalize_success(_event_id uuid, _worker text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_ok boolean := false;
BEGIN
  UPDATE public.asaas_webhook_events
     SET status = 'processed', processed_at = now(), error = NULL, error_code = NULL,
         locked_by = NULL, claim_expires_at = NULL, updated_at = now()
   WHERE id = _event_id AND status = 'processing' AND locked_by = _worker;
  v_ok := FOUND;
  RETURN v_ok;
END;
$$;

CREATE OR REPLACE FUNCTION public.asaas_webhook_finalize_failure(
  _event_id uuid, _worker text, _error text, _error_code text DEFAULT NULL, _fatal boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_row record; v_status text; v_delay integer;
BEGIN
  SELECT attempt_count, max_attempts INTO v_row
    FROM public.asaas_webhook_events
   WHERE id = _event_id AND status = 'processing' AND locked_by = _worker;
  IF v_row IS NULL THEN RETURN NULL; END IF;

  IF _fatal OR v_row.attempt_count >= v_row.max_attempts THEN
    v_status := 'dead_letter';
  ELSE
    v_status := 'retry';
  END IF;

  v_delay := LEAST(60 * power(2, GREATEST(v_row.attempt_count - 1, 0))::int, 960);

  UPDATE public.asaas_webhook_events
     SET status = v_status,
         error = left(COALESCE(_error, 'unknown'), 2000),
         error_code = _error_code,
         dead_lettered_at = CASE WHEN v_status = 'dead_letter' THEN now() ELSE NULL END,
         next_attempt_at = CASE WHEN v_status = 'retry' THEN now() + make_interval(secs => v_delay) ELSE next_attempt_at END,
         locked_by = NULL, claim_expires_at = NULL, updated_at = now()
   WHERE id = _event_id;

  RETURN v_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.asaas_webhook_requeue(_event_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.asaas_webhook_events
     SET status = 'pending', attempt_count = 0, next_attempt_at = now(),
         locked_by = NULL, claim_expires_at = NULL, dead_lettered_at = NULL,
         error = NULL, error_code = NULL, updated_at = now()
   WHERE id = _event_id AND status IN ('dead_letter','retry');
  RETURN FOUND;
END;
$$;

-- ============================================================
-- 8. RPCs de fila — PLUGGY
-- ============================================================
CREATE OR REPLACE FUNCTION public.pluggy_webhook_claim(
  _worker text,
  _batch integer DEFAULT 25,
  _lease_seconds integer DEFAULT 120
)
RETURNS TABLE(id uuid, event_id text, event_type text, pluggy_item_id text, payload jsonb, attempt_count integer, max_attempts integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT e.id
      FROM public.pluggy_webhook_events e
     WHERE (
             (e.status IN ('pending','retry') AND e.next_attempt_at <= now())
             OR (e.status = 'processing' AND e.claim_expires_at IS NOT NULL AND e.claim_expires_at < now())
           )
       AND e.attempt_count < e.max_attempts
     ORDER BY e.next_attempt_at, e.created_at
     LIMIT GREATEST(COALESCE(_batch, 25), 1)
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.pluggy_webhook_events e
     SET status = 'processing',
         locked_by = _worker,
         claim_expires_at = now() + make_interval(secs => GREATEST(COALESCE(_lease_seconds, 120), 10)),
         attempt_count = e.attempt_count + 1,
         updated_at = now()
   WHERE e.id IN (SELECT p.id FROM picked p)
  RETURNING e.id, e.event_id, e.event_type, e.pluggy_item_id, e.payload, e.attempt_count, e.max_attempts;
END;
$$;

CREATE OR REPLACE FUNCTION public.pluggy_webhook_finalize_success(_event_id uuid, _worker text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.pluggy_webhook_events
     SET status = 'processed', processed_at = now(), error = NULL, error_code = NULL,
         locked_by = NULL, claim_expires_at = NULL, updated_at = now()
   WHERE id = _event_id AND status = 'processing' AND locked_by = _worker;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.pluggy_webhook_finalize_failure(
  _event_id uuid, _worker text, _error text, _error_code text DEFAULT NULL, _fatal boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_row record; v_status text; v_delay integer;
BEGIN
  SELECT attempt_count, max_attempts INTO v_row
    FROM public.pluggy_webhook_events
   WHERE id = _event_id AND status = 'processing' AND locked_by = _worker;
  IF v_row IS NULL THEN RETURN NULL; END IF;

  IF _fatal OR v_row.attempt_count >= v_row.max_attempts THEN
    v_status := 'dead_letter';
  ELSE
    v_status := 'retry';
  END IF;

  v_delay := LEAST(60 * power(2, GREATEST(v_row.attempt_count - 1, 0))::int, 960);

  UPDATE public.pluggy_webhook_events
     SET status = v_status,
         error = left(COALESCE(_error, 'unknown'), 2000),
         error_code = _error_code,
         dead_lettered_at = CASE WHEN v_status = 'dead_letter' THEN now() ELSE NULL END,
         next_attempt_at = CASE WHEN v_status = 'retry' THEN now() + make_interval(secs => v_delay) ELSE next_attempt_at END,
         locked_by = NULL, claim_expires_at = NULL, updated_at = now()
   WHERE id = _event_id;

  RETURN v_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.pluggy_webhook_requeue(_event_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.pluggy_webhook_events
     SET status = 'pending', attempt_count = 0, next_attempt_at = now(),
         locked_by = NULL, claim_expires_at = NULL, dead_lettered_at = NULL,
         error = NULL, error_code = NULL, updated_at = now()
   WHERE id = _event_id AND status IN ('dead_letter','retry');
  RETURN FOUND;
END;
$$;

-- ============================================================
-- 9. Permissões: só service_role
-- ============================================================
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.asaas_webhook_claim(text, integer, integer)',
    'public.asaas_webhook_finalize_success(uuid, text)',
    'public.asaas_webhook_finalize_failure(uuid, text, text, text, boolean)',
    'public.asaas_webhook_requeue(uuid)',
    'public.pluggy_webhook_claim(text, integer, integer)',
    'public.pluggy_webhook_finalize_success(uuid, text)',
    'public.pluggy_webhook_finalize_failure(uuid, text, text, text, boolean)',
    'public.pluggy_webhook_requeue(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;