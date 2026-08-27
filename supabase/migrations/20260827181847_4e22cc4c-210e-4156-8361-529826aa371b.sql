-- 1. Remover jobs quebrados (funções/tabelas inexistentes)
DO $$
DECLARE j text;
BEGIN
  FOREACH j IN ARRAY ARRAY[
    'open-finance-enqueue-syncs',
    'pluggy-enqueue-daily',
    'pluggy-reap-stuck-runs',
    'pluggy-expire-stale-requests',
    'pluggy-v2-expire-stale',
    'pluggy-cleanup-weekly'
  ] LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = j) THEN
      PERFORM cron.unschedule(j);
    END IF;
  END LOOP;
END $$;

-- 2. Sincronização Open Finance a cada 6 horas (estava sem nenhum agendamento)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pluggy-cron-sync-6h') THEN
    PERFORM cron.unschedule('pluggy-cron-sync-6h');
  END IF;
END $$;

SELECT cron.schedule(
  'pluggy-cron-sync-6h',
  '7 */6 * * *',
  $job$
  SELECT net.http_post(
    url := 'https://grtxmbffgmgnkawlvqhm.supabase.co/functions/v1/pluggy-cron-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'pluggy_cron_secret' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $job$
);

-- 3. Função de saúde dos agendamentos (somente super admin)
CREATE OR REPLACE FUNCTION public.cron_health(_window_hours integer DEFAULT 24)
RETURNS TABLE(
  jobname text,
  schedule text,
  active boolean,
  last_run timestamptz,
  last_status text,
  last_error text,
  runs_ok bigint,
  runs_failed bigint,
  minutes_since_last numeric,
  stale boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, cron
AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH runs AS (
    SELECT d.jobid,
           count(*) FILTER (WHERE d.status = 'succeeded') AS ok,
           count(*) FILTER (WHERE d.status <> 'succeeded') AS bad
    FROM cron.job_run_details d
    WHERE d.start_time > now() - make_interval(hours => GREATEST(1, _window_hours))
    GROUP BY d.jobid
  ),
  ultimo AS (
    SELECT DISTINCT ON (d.jobid) d.jobid, d.end_time, d.status, d.return_message
    FROM cron.job_run_details d
    ORDER BY d.jobid, d.start_time DESC
  )
  SELECT j.jobname::text,
         j.schedule::text,
         j.active,
         u.end_time,
         u.status::text,
         CASE WHEN u.status <> 'succeeded' THEN left(coalesce(u.return_message, ''), 500) ELSE NULL END,
         coalesce(r.ok, 0),
         coalesce(r.bad, 0),
         round(extract(epoch FROM (now() - u.end_time)) / 60.0, 1),
         (u.end_time IS NULL OR u.end_time < now() - interval '48 hours' OR coalesce(r.bad, 0) > 0)
  FROM cron.job j
  LEFT JOIN runs r ON r.jobid = j.jobid
  LEFT JOIN ultimo u ON u.jobid = j.jobid
  ORDER BY coalesce(r.bad, 0) DESC, j.jobname;
END $$;

REVOKE ALL ON FUNCTION public.cron_health(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cron_health(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.cron_health(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cron_health(integer) TO service_role;