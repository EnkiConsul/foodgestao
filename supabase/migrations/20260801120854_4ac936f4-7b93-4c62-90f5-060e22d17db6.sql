ALTER TABLE public.pluggy_connections
  ADD COLUMN IF NOT EXISTS next_sync_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS sync_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_sync_status text,
  ADD COLUMN IF NOT EXISTS last_sync_error text,
  ADD COLUMN IF NOT EXISTS last_sync_attempt_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_pluggy_connections_next_sync
  ON public.pluggy_connections (next_sync_at)
  WHERE status <> 'deleted';

COMMENT ON COLUMN public.pluggy_connections.next_sync_at IS
  'Momento a partir do qual o cron pode tentar sincronizar esta conexão (backoff progressivo em falhas).';
COMMENT ON COLUMN public.pluggy_connections.sync_attempts IS
  'Falhas consecutivas de sincronização; zera no sucesso. >= 6 => dead letter (aguarda intervenção).';
