-- Alinha a rotina da régua ao segredo interno já compartilhado pelos jobs
-- (pluggy_cron_secret), que é o mesmo publicado como PLUGGY_CRON_SECRET nas
-- funções. Evita um segredo órfão que a função não conheceria.

DO $$
BEGIN
  PERFORM cron.unschedule('billing-dunning-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'billing-dunning-daily',
  '0 11 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://grtxmbffgmgnkawlvqhm.supabase.co/functions/v1/billing-dunning',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'pluggy_cron_secret' LIMIT 1)
    ),
    body := jsonb_build_object('trigger', 'cron')
  );
  $cron$
);

DELETE FROM vault.secrets WHERE name = 'BILLING_DUNNING_SECRET';