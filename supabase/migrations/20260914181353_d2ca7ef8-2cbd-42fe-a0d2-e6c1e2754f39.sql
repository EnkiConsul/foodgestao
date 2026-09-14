-- lovable-cron-fallback-reviewed: 1440 runs/day; fila de documentos exige latência de minutos e a chamada retorna de imediato quando não há trabalho; agendamento já existia, aqui só troca a origem do segredo
-- Fase 6: segredo do processador de documentos passa a viver apenas no cofre
-- criptografado (Vault). A tabela comum private.dp_bulk_worker_auth é removida.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'DP_BULK_WORKER_CRON_SECRET') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'private' AND table_name = 'dp_bulk_worker_auth'
    ) THEN
      PERFORM vault.create_secret(
        (SELECT secret FROM private.dp_bulk_worker_auth WHERE id LIMIT 1),
        'DP_BULK_WORKER_CRON_SECRET',
        'Segredo interno do agendamento do processador de documentos (Pessoas 360)'
      );
    ELSE
      PERFORM vault.create_secret(
        encode(gen_random_bytes(32), 'hex'),
        'DP_BULK_WORKER_CRON_SECRET',
        'Segredo interno do agendamento do processador de documentos (Pessoas 360)'
      );
    END IF;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.dp_bulk_worker_secret()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v text;
BEGIN
  PERFORM private.dp_bulk_assert_service();
  SELECT decrypted_secret INTO v
    FROM vault.decrypted_secrets
   WHERE name = 'DP_BULK_WORKER_CRON_SECRET'
   LIMIT 1;
  RETURN v;
END $$;

REVOKE ALL ON FUNCTION public.dp_bulk_worker_secret() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_bulk_worker_secret() FROM anon;
REVOKE ALL ON FUNCTION public.dp_bulk_worker_secret() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.dp_bulk_worker_secret() TO service_role;

DO $$
BEGIN
  PERFORM cron.unschedule('dp-doc-bulk-worker-tick');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'dp-doc-bulk-worker-tick',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://grtxmbffgmgnkawlvqhm.supabase.co/functions/v1/dp-doc-bulk-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'DP_BULK_WORKER_CRON_SECRET' LIMIT 1)
    ),
    body := jsonb_build_object('trigger', 'cron')
  );
  $cron$
);

DROP TABLE IF EXISTS private.dp_bulk_worker_auth;