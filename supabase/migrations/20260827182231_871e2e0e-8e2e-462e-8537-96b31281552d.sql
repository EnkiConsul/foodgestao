SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'pluggy-cron-sync-6h'),
  command := $job$
  SELECT net.http_post(
    url := 'https://grtxmbffgmgnkawlvqhm.supabase.co/functions/v1/pluggy-cron-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'pluggy_cron_secret' LIMIT 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $job$
);