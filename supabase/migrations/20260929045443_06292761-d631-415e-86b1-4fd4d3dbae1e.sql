-- Rotina diária da régua de cobrança: 11:00 UTC = 08:00 em Brasília.
-- Uma execução por dia: apura o estágio, enfileira e envia os e-mails devidos.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'BILLING_DUNNING_SECRET') THEN
    PERFORM vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'BILLING_DUNNING_SECRET',
      'Segredo interno da rotina diária da régua de cobrança (Aveto 360)'
    );
  END IF;
END $$;

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
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'BILLING_DUNNING_SECRET' LIMIT 1)
    ),
    body := jsonb_build_object('trigger', 'cron')
  );
  $cron$
);