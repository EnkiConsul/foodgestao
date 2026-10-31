-- 1) Backfill de created_by (só onde está nulo)
UPDATE public.pluggy_connections c
   SET created_by = COALESCE(
     (SELECT r.user_id FROM public.pluggy_connect_requests r
       WHERE r.resolved_item_id = c.pluggy_item_id AND r.user_id IS NOT NULL
       ORDER BY r.created_at DESC LIMIT 1),
     (SELECT co.user_id FROM public.companies co WHERE co.id = c.company_id))
 WHERE c.created_by IS NULL;

-- 2) Fila de remoção remota do item na Pluggy
ALTER TABLE public.pluggy_connections
  ADD COLUMN IF NOT EXISTS needs_remote_delete boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS remote_delete_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS remote_delete_next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS remote_delete_claimed_until timestamptz,
  ADD COLUMN IF NOT EXISTS remote_delete_dead_letter boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS remote_deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS remote_delete_last_error text;

CREATE INDEX IF NOT EXISTS idx_pluggy_connections_remote_delete
  ON public.pluggy_connections (remote_delete_next_attempt_at)
  WHERE needs_remote_delete = true AND remote_delete_dead_letter = false;

-- Conexões já encerradas sem confirmação do provedor entram na fila
UPDATE public.pluggy_connections
   SET needs_remote_delete = true,
       remote_delete_next_attempt_at = now(),
       provider_delete_status = COALESCE(provider_delete_status, 'pending')
 WHERE status IN ('deleted','revoked')
   AND (provider_delete_status IS NULL OR provider_delete_status LIKE 'failed%' OR provider_delete_status = 'pending')
   AND needs_remote_delete = false
   AND remote_deleted_at IS NULL;

-- As RPCs antigas apontavam para open_finance_connections (tabela inexistente).
CREATE OR REPLACE FUNCTION public.pluggy_remote_delete_claim(
  _batch integer DEFAULT 5, _lease_seconds integer DEFAULT 90
) RETURNS TABLE(id uuid, pluggy_item_id text, remote_delete_attempts integer)
 LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH picked AS (
    SELECT c.id FROM public.pluggy_connections c
     WHERE c.needs_remote_delete = true
       AND c.remote_delete_dead_letter = false
       AND c.remote_deleted_at IS NULL
       AND c.status IN ('deleted','revoked')
       AND (c.remote_delete_next_attempt_at IS NULL OR c.remote_delete_next_attempt_at <= now())
       AND (c.remote_delete_claimed_until IS NULL OR c.remote_delete_claimed_until <= now())
     ORDER BY c.remote_delete_next_attempt_at NULLS FIRST
     LIMIT GREATEST(LEAST(_batch, 50), 1)
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.pluggy_connections c
     SET remote_delete_claimed_until = now() + make_interval(secs => GREATEST(_lease_seconds, 30))
    FROM picked WHERE c.id = picked.id
  RETURNING c.id, c.pluggy_item_id, c.remote_delete_attempts;
$$;
REVOKE ALL ON FUNCTION public.pluggy_remote_delete_claim(integer, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pluggy_remote_delete_claim(integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.pluggy_remote_delete_finalize_success(_id uuid)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$
  UPDATE public.pluggy_connections
     SET needs_remote_delete = false, remote_deleted_at = now(),
         remote_delete_claimed_until = NULL, remote_delete_last_error = NULL,
         provider_delete_status = 'ok'
   WHERE id = _id;
$$;
REVOKE ALL ON FUNCTION public.pluggy_remote_delete_finalize_success(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pluggy_remote_delete_finalize_success(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.pluggy_remote_delete_finalize_failure(
  _id uuid, _error text, _max_attempts integer DEFAULT 10
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _next integer; _delay integer;
BEGIN
  UPDATE public.pluggy_connections SET remote_delete_attempts = remote_delete_attempts + 1
   WHERE id = _id RETURNING remote_delete_attempts INTO _next;
  IF _next IS NULL THEN RETURN; END IF;
  _delay := LEAST(60 * (2 ^ LEAST(_next, 10))::int, 24 * 3600);
  UPDATE public.pluggy_connections
     SET remote_delete_last_error = LEFT(COALESCE(_error,'unknown'), 500),
         provider_delete_status = 'failed: ' || LEFT(COALESCE(_error,'unknown'), 200),
         remote_delete_next_attempt_at = now() + make_interval(secs => _delay),
         remote_delete_claimed_until = NULL,
         remote_delete_dead_letter = (_next >= _max_attempts)
   WHERE id = _id;
END $$;
REVOKE ALL ON FUNCTION public.pluggy_remote_delete_finalize_failure(uuid, text, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pluggy_remote_delete_finalize_failure(uuid, text, integer) TO service_role;

-- 3) Claim atômico do cron de sincronização
CREATE OR REPLACE FUNCTION public.pluggy_connections_claim_due(
  _batch integer DEFAULT 10, _lease_minutes integer DEFAULT 10
) RETURNS TABLE(id uuid, pluggy_item_id text, sync_attempts integer)
 LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH picked AS (
    SELECT c.id FROM public.pluggy_connections c
     WHERE c.status NOT IN ('deleted','revoked','login_error')
       AND c.sync_attempts < 6
       AND c.next_sync_at <= now()
     ORDER BY c.next_sync_at ASC
     LIMIT GREATEST(LEAST(_batch, 100), 1)
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.pluggy_connections c
     SET next_sync_at = now() + make_interval(mins => GREATEST(_lease_minutes, 1)),
         last_sync_attempt_at = now()
    FROM picked WHERE c.id = picked.id
  RETURNING c.id, c.pluggy_item_id, c.sync_attempts;
$$;
REVOKE ALL ON FUNCTION public.pluggy_connections_claim_due(integer, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pluggy_connections_claim_due(integer, integer) TO service_role;