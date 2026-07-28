-- 1. open_finance_webhook_events: colunas de recuperação
ALTER TABLE public.open_finance_webhook_events
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS company_id uuid,
  ADD COLUMN IF NOT EXISTS connection_id uuid,
  ADD COLUMN IF NOT EXISTS connection_request_id uuid,
  ADD COLUMN IF NOT EXISTS client_user_id text,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempt_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error_code text;

-- Backfill idempotente
UPDATE public.open_finance_webhook_events
SET status = 'processed'
WHERE processed_at IS NOT NULL AND status = 'pending';

-- Constraint de valores válidos (drop-recreate seguro)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.open_finance_webhook_events'::regclass
      AND conname  = 'open_finance_webhook_events_status_chk'
  ) THEN
    ALTER TABLE public.open_finance_webhook_events
      ADD CONSTRAINT open_finance_webhook_events_status_chk
      CHECK (status IN ('pending','processing','processed','retry','failed'));
  END IF;
END$$;

-- Índice para o drain reprocessar
CREATE INDEX IF NOT EXISTS idx_of_webhook_events_ready
  ON public.open_finance_webhook_events (next_attempt_at)
  WHERE status IN ('pending','retry');

-- 2. Proteção cross-tenant global no Item Pluggy
DO $$
DECLARE
  dup_count int;
BEGIN
  SELECT count(*) INTO dup_count FROM (
    SELECT pluggy_item_id FROM public.open_finance_connections
    WHERE pluggy_item_id IS NOT NULL
    GROUP BY pluggy_item_id HAVING count(*) > 1
  ) t;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Cannot add global unique on open_finance_connections.pluggy_item_id: % duplicates exist. Investigate before applying.', dup_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public'
      AND indexname='uq_of_connections_pluggy_item_global'
  ) THEN
    CREATE UNIQUE INDEX uq_of_connections_pluggy_item_global
      ON public.open_finance_connections (pluggy_item_id);
  END IF;
END$$;

-- 3. Impede duas sincronizações iniciais concorrentes por conexão
CREATE UNIQUE INDEX IF NOT EXISTS uq_of_sync_runs_initial_active
  ON public.open_finance_sync_runs (connection_id)
  WHERE status IN ('queued','running')
    AND triggered_by IN ('webhook:item/created','item_register','materialize');
