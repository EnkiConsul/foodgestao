-- Bloco 4: retry + backoff + recovery de sync_runs travados
ALTER TABLE public.open_finance_sync_runs
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts  integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_of_sync_runs_ready
  ON public.open_finance_sync_runs (next_attempt_at)
  WHERE status = 'queued';

-- Reclaimer + backoff-aware claim
CREATE OR REPLACE FUNCTION public.claim_open_finance_sync(
  _worker_id text,
  _lock_seconds integer DEFAULT 300
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Step 1: promote stuck 'running' runs back to 'queued' (worker died mid-flight)
  UPDATE public.open_finance_sync_runs
     SET status = 'queued',
         claimed_by = NULL,
         claim_expires_at = NULL
   WHERE status = 'running'
     AND claim_expires_at IS NOT NULL
     AND claim_expires_at < now();

  -- Step 2: claim the next ready row (skip locked; respect backoff)
  WITH cte AS (
    SELECT id
      FROM public.open_finance_sync_runs
     WHERE status = 'queued'
       AND next_attempt_at <= now()
     ORDER BY next_attempt_at ASC, created_at ASC
     FOR UPDATE SKIP LOCKED
     LIMIT 1
  )
  UPDATE public.open_finance_sync_runs r
     SET status = 'running',
         claimed_by = _worker_id,
         started_at = now(),
         claim_expires_at = now() + make_interval(secs => _lock_seconds),
         attempt_count = r.attempt_count + 1
   FROM cte
   WHERE r.id = cte.id
   RETURNING r.id INTO v_id;

  RETURN v_id;
END;
$$;

-- Release with automatic re-enqueue on transient error
CREATE OR REPLACE FUNCTION public.release_open_finance_sync(
  _run_id uuid,
  _status text,
  _stats jsonb DEFAULT '{}'::jsonb,
  _error text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempts integer;
  v_max integer;
  v_backoff_seconds integer;
BEGIN
  SELECT attempt_count, max_attempts
    INTO v_attempts, v_max
    FROM public.open_finance_sync_runs
   WHERE id = _run_id;

  IF _status = 'success' THEN
    UPDATE public.open_finance_sync_runs
       SET status = 'success',
           finished_at = now(),
           stats = COALESCE(_stats, '{}'::jsonb),
           error = NULL,
           claim_expires_at = NULL
     WHERE id = _run_id;
    RETURN;
  END IF;

  -- error path: retry with exponential backoff, cap at max_attempts
  IF v_attempts < v_max THEN
    v_backoff_seconds := LEAST(600, 30 * (2 ^ GREATEST(v_attempts - 1, 0))::integer);
    UPDATE public.open_finance_sync_runs
       SET status = 'queued',
           finished_at = NULL,
           stats = COALESCE(_stats, '{}'::jsonb),
           error = _error,
           claimed_by = NULL,
           claim_expires_at = NULL,
           next_attempt_at = now() + make_interval(secs => v_backoff_seconds)
     WHERE id = _run_id;
  ELSE
    UPDATE public.open_finance_sync_runs
       SET status = 'error',
           finished_at = now(),
           stats = COALESCE(_stats, '{}'::jsonb),
           error = _error,
           claim_expires_at = NULL
     WHERE id = _run_id;
  END IF;
END;
$$;