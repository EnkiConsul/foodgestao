-- ============================================================
-- BLOCO 2 — Connect Token & Request (schema hardening)
-- ============================================================

-- 1) Novas colunas de ciclo de vida
ALTER TABLE public.open_finance_connection_requests
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS existing_connection_id uuid NULL
    REFERENCES public.open_finance_connections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS token_created_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS token_expires_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS correlation_expires_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS error_code text NULL,
  ADD COLUMN IF NOT EXISTS idempotency_key text NULL;

-- 2) Backfill do enum de status antes de aplicar a CHECK
--    'pending' era o único valor legado -> vira 'created'
UPDATE public.open_finance_connection_requests
SET status = 'created'
WHERE status = 'pending';

-- Garante default consistente com o novo enum
ALTER TABLE public.open_finance_connection_requests
  ALTER COLUMN status SET DEFAULT 'created';

-- Backfill de mode a partir de metadata (sem sobrescrever registros já classificados)
UPDATE public.open_finance_connection_requests
SET mode = CASE
  WHEN pluggy_item_id IS NOT NULL THEN 'reconnect'
  ELSE 'new'
END
WHERE mode IS NULL OR mode = 'new';

-- 3) CHECK constraint de status canônico
ALTER TABLE public.open_finance_connection_requests
  DROP CONSTRAINT IF EXISTS of_conn_req_status_chk;
ALTER TABLE public.open_finance_connection_requests
  ADD CONSTRAINT of_conn_req_status_chk
  CHECK (status IN (
    'created',
    'token_created',
    'awaiting_authorization',
    'processing',
    'connected',
    'waiting_user_action',
    'failed',
    'cancelled',
    'expired'
  ));

-- 4) CHECK de mode
ALTER TABLE public.open_finance_connection_requests
  DROP CONSTRAINT IF EXISTS of_conn_req_mode_chk;
ALTER TABLE public.open_finance_connection_requests
  ADD CONSTRAINT of_conn_req_mode_chk
  CHECK (mode IN ('new', 'update', 'reconnect'));

-- 5) Índices auxiliares
CREATE INDEX IF NOT EXISTS idx_of_conn_req_correlation_expires
  ON public.open_finance_connection_requests (correlation_expires_at)
  WHERE status IN ('created','token_created','awaiting_authorization','processing','waiting_user_action');

CREATE INDEX IF NOT EXISTS idx_of_conn_req_idem
  ON public.open_finance_connection_requests (company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_of_conn_req_pluggy_item
  ON public.open_finance_connection_requests (pluggy_item_id)
  WHERE pluggy_item_id IS NOT NULL;

-- 6) Endurecer RLS: mover escrita para service_role apenas.
--    Leitura continua para dono ou admin/owner da empresa.
DROP POLICY IF EXISTS of_conn_req_write_admins ON public.open_finance_connection_requests;
DROP POLICY IF EXISTS of_conn_req_service_write ON public.open_finance_connection_requests;

-- Somente service_role escreve (Edge Functions com SUPABASE_SERVICE_ROLE_KEY)
CREATE POLICY of_conn_req_service_write
  ON public.open_finance_connection_requests
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Confirma GRANTs mínimos (service_role já teria via bypass, mas explícito):
GRANT SELECT ON public.open_finance_connection_requests TO authenticated;
GRANT ALL    ON public.open_finance_connection_requests TO service_role;