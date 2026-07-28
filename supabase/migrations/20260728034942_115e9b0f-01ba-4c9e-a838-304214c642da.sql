
DO $$
DECLARE
  v_secret text;
BEGIN
  BEGIN
    v_secret := current_setting('app.pluggy_cron_secret', true);
  EXCEPTION WHEN OTHERS THEN
    v_secret := NULL;
  END;

  -- Remove old job if exists
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'pluggy-v2-alerts-tick';

  PERFORM cron.schedule(
    'pluggy-v2-alerts-tick',
    '*/5 * * * *',
    $cron$
    SELECT net.http_post(
      url := 'https://grtxmbffgmgnkawlvqhm.supabase.co/functions/v1/pluggy-v2-alerts',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', coalesce(current_setting('app.settings.pluggy_cron_secret', true), '')
      ),
      body := '{}'::jsonb
    );
    $cron$
  );
END $$;
