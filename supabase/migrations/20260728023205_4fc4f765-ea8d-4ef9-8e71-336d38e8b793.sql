
ALTER TABLE public.open_finance_connections
  ADD COLUMN IF NOT EXISTS remote_delete_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS remote_delete_next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS remote_delete_last_error text,
  ADD COLUMN IF NOT EXISTS remote_delete_dead_letter boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS remote_delete_claimed_until timestamptz;

CREATE INDEX IF NOT EXISTS idx_ofc_remote_delete_pending
  ON public.open_finance_connections (remote_delete_next_attempt_at)
  WHERE needs_remote_delete = true
    AND remote_delete_dead_letter = false
    AND remote_deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.disconnect_open_finance_connection(_connection_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _company_id uuid; _caller uuid := auth.uid();
BEGIN
  SELECT company_id INTO _company_id FROM public.open_finance_connections WHERE id = _connection_id;
  IF _company_id IS NULL THEN RAISE EXCEPTION 'open_finance_connection not found'; END IF;
  IF NOT public.is_company_admin_or_owner(_caller, _company_id) THEN
    RAISE EXCEPTION 'permission denied for company %', _company_id;
  END IF;
  UPDATE public.open_finance_connections
     SET status = 'disconnected',
         disconnected_at = now(),
         needs_remote_delete = true,
         remote_delete_attempts = 0,
         remote_delete_next_attempt_at = now(),
         remote_delete_last_error = NULL,
         remote_delete_dead_letter = false,
         remote_delete_claimed_until = NULL,
         updated_at = now()
   WHERE id = _connection_id;
  UPDATE public.open_finance_accounts
     SET auto_import = false, updated_at = now()
   WHERE connection_id = _connection_id;
  PERFORM public.insert_audit_log(
    _action := 'open_finance_connection_disconnected',
    _entity_type := 'open_finance_connection',
    _entity_id := _connection_id::text,
    _details := jsonb_build_object('company_id', _company_id, 'needs_remote_delete', true)
  );
END $function$;

CREATE OR REPLACE FUNCTION public.pluggy_remote_delete_claim(
  _batch integer DEFAULT 5,
  _lease_seconds integer DEFAULT 90
) RETURNS TABLE(id uuid, pluggy_item_id text, remote_delete_attempts integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  WITH picked AS (
    SELECT c.id
      FROM public.open_finance_connections c
     WHERE c.needs_remote_delete = true
       AND c.remote_delete_dead_letter = false
       AND c.remote_deleted_at IS NULL
       AND (c.remote_delete_next_attempt_at IS NULL OR c.remote_delete_next_attempt_at <= now())
       AND (c.remote_delete_claimed_until IS NULL OR c.remote_delete_claimed_until <= now())
       AND c.pluggy_item_id IS NOT NULL
     ORDER BY c.remote_delete_next_attempt_at NULLS FIRST
     LIMIT GREATEST(_batch, 1)
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.open_finance_connections c
     SET remote_delete_claimed_until = now() + make_interval(secs => GREATEST(_lease_seconds, 30)),
         updated_at = now()
    FROM picked
   WHERE c.id = picked.id
  RETURNING c.id, c.pluggy_item_id, c.remote_delete_attempts;
$$;
REVOKE ALL ON FUNCTION public.pluggy_remote_delete_claim(integer, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pluggy_remote_delete_claim(integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.pluggy_remote_delete_finalize_success(_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  UPDATE public.open_finance_connections
     SET needs_remote_delete = false,
         remote_deleted_at = now(),
         remote_delete_claimed_until = NULL,
         remote_delete_last_error = NULL,
         updated_at = now()
   WHERE id = _id;
$$;
REVOKE ALL ON FUNCTION public.pluggy_remote_delete_finalize_success(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pluggy_remote_delete_finalize_success(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.pluggy_remote_delete_finalize_failure(
  _id uuid,
  _error text,
  _max_attempts integer DEFAULT 10
) RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  _next integer;
  _delay_seconds integer;
BEGIN
  UPDATE public.open_finance_connections
     SET remote_delete_attempts = remote_delete_attempts + 1
   WHERE id = _id
  RETURNING remote_delete_attempts INTO _next;

  IF _next IS NULL THEN RETURN; END IF;

  _delay_seconds := LEAST(60 * (2 ^ LEAST(_next, 10))::int, 24 * 3600);

  UPDATE public.open_finance_connections
     SET remote_delete_last_error = LEFT(COALESCE(_error, 'unknown'), 500),
         last_error = LEFT(COALESCE(_error, 'unknown'), 500),
         last_error_at = now(),
         remote_delete_next_attempt_at = now() + make_interval(secs => _delay_seconds),
         remote_delete_claimed_until = NULL,
         remote_delete_dead_letter = (_next >= _max_attempts),
         updated_at = now()
   WHERE id = _id;
END $$;
REVOKE ALL ON FUNCTION public.pluggy_remote_delete_finalize_failure(uuid, text, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pluggy_remote_delete_finalize_failure(uuid, text, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.pluggy_remote_delete_health()
 RETURNS TABLE(
   pending bigint,
   overdue bigint,
   leased bigint,
   dead_letter bigint,
   oldest_pending_seconds numeric,
   max_dead_letter_attempts integer
 )
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT
    COUNT(*) FILTER (WHERE needs_remote_delete AND NOT remote_delete_dead_letter AND remote_deleted_at IS NULL) AS pending,
    COUNT(*) FILTER (WHERE needs_remote_delete AND NOT remote_delete_dead_letter AND remote_deleted_at IS NULL AND (remote_delete_next_attempt_at IS NULL OR remote_delete_next_attempt_at <= now())) AS overdue,
    COUNT(*) FILTER (WHERE remote_delete_claimed_until IS NOT NULL AND remote_delete_claimed_until > now()) AS leased,
    COUNT(*) FILTER (WHERE remote_delete_dead_letter) AS dead_letter,
    EXTRACT(EPOCH FROM (now() - MIN(remote_delete_next_attempt_at) FILTER (WHERE needs_remote_delete AND NOT remote_delete_dead_letter AND remote_deleted_at IS NULL)))::numeric AS oldest_pending_seconds,
    COALESCE(MAX(remote_delete_attempts) FILTER (WHERE remote_delete_dead_letter), 0)::integer AS max_dead_letter_attempts
  FROM public.open_finance_connections;
$$;
REVOKE ALL ON FUNCTION public.pluggy_remote_delete_health() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pluggy_remote_delete_health() TO service_role, authenticated;

DO $$
BEGIN
  PERFORM cron.unschedule('pluggy-remote-delete-tick');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'pluggy-remote-delete-tick',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://grtxmbffgmgnkawlvqhm.supabase.co/functions/v1/pluggy-remote-delete-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'PLUGGY_CRON_TICK_SECRET' LIMIT 1)
    ),
    body := jsonb_build_object('trigger', 'cron', 'batch', 10)
  );
  $cron$
);
