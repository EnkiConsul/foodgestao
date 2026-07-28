
-- 1. Novas colunas de controle do worker
ALTER TABLE public.open_finance_webhook_events
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS claimed_by text,
  ADD COLUMN IF NOT EXISTS claim_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz;

-- 2. Migrar status legado 'failed' -> 'dead_letter'
ALTER TABLE public.open_finance_webhook_events
  DROP CONSTRAINT IF EXISTS open_finance_webhook_events_status_chk;

UPDATE public.open_finance_webhook_events
   SET status = 'dead_letter'
 WHERE status = 'failed';

ALTER TABLE public.open_finance_webhook_events
  ADD CONSTRAINT open_finance_webhook_events_status_chk
  CHECK (status = ANY (ARRAY['pending','processing','processed','retry','dead_letter']));

-- 3. Índices adicionais
CREATE INDEX IF NOT EXISTS idx_of_webhook_events_claim_expiry
  ON public.open_finance_webhook_events (claim_expires_at)
  WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS idx_of_webhook_events_status_next
  ON public.open_finance_webhook_events (status, next_attempt_at);

-- 4. Correlação sync_run -> webhook event (idempotência)
ALTER TABLE public.open_finance_sync_runs
  ADD COLUMN IF NOT EXISTS source_webhook_event_id uuid
    REFERENCES public.open_finance_webhook_events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_of_sync_runs_source_webhook
  ON public.open_finance_sync_runs (source_webhook_event_id)
  WHERE source_webhook_event_id IS NOT NULL;
