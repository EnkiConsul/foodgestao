-- Open Finance: reaper de execuções travadas + verificação de cooldown por conexão

CREATE OR REPLACE FUNCTION public.pluggy_reap_stale_sync_runs(_timeout_minutes integer DEFAULT 15)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_timeout integer := GREATEST(COALESCE(_timeout_minutes, 15), 1);
  v_count integer := 0;
BEGIN
  WITH reaped AS (
    UPDATE public.pluggy_v2_sync_runs
       SET status = 'error',
           finished_at = now(),
           error_message = COALESCE(error_message,
             'Execução cancelada por tempo limite de inatividade (reaper)'),
           updated_at = now()
     WHERE status = 'running'
       AND started_at < now() - make_interval(mins => v_timeout)
    RETURNING 1
  )
  SELECT count(*)::int INTO v_count FROM reaped;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.pluggy_reap_stale_sync_runs(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pluggy_reap_stale_sync_runs(integer) TO service_role;

-- Cooldown: true quando a conexão já sincronizou com sucesso nos últimos minutos.
CREATE OR REPLACE FUNCTION public.pluggy_connection_in_cooldown(
  _item_id text,
  _cooldown_minutes integer DEFAULT 15
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.pluggy_connections c
     WHERE c.pluggy_item_id = _item_id
       AND c.last_synced_at IS NOT NULL
       AND c.last_synced_at > now() - make_interval(mins => GREATEST(COALESCE(_cooldown_minutes, 15), 1))
  )
  OR EXISTS (
    SELECT 1
      FROM public.pluggy_v2_connections v
     WHERE v.pluggy_item_id = _item_id
       AND v.last_sync_at IS NOT NULL
       AND v.last_sync_at > now() - make_interval(mins => GREATEST(COALESCE(_cooldown_minutes, 15), 1))
  );
$$;

REVOKE ALL ON FUNCTION public.pluggy_connection_in_cooldown(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pluggy_connection_in_cooldown(text, integer) TO service_role;
