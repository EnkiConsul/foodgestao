-- =========================================================
-- FASE 1 — SCHEMA V2 DA INTEGRAÇÃO PLUGGY (ISOLADO)
-- Prefixo pluggy_v2_* — nenhuma tabela existente é modificada
-- =========================================================

-- ---------- ENUMS ----------
DO $$ BEGIN
  CREATE TYPE public.pluggy_v2_connection_status AS ENUM (
    'created','updating','login_error','waiting_user_input',
    'outdated','updated','deleted','error'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.pluggy_v2_sync_status AS ENUM (
    'pending','running','success','partial','error','dead_letter'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.pluggy_v2_webhook_status AS ENUM (
    'pending','processing','success','error','dead_letter','skipped'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =========================================================
-- 1. pluggy_v2_connect_requests
-- Efêmero: NÃO persiste connect_token, só metadados de auditoria
-- =========================================================
CREATE TABLE public.pluggy_v2_connect_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_user_id TEXT NOT NULL,
  connector_id INTEGER,
  connector_name TEXT,
  intent TEXT NOT NULL DEFAULT 'create' CHECK (intent IN ('create','reconnect','update')),
  target_item_id TEXT, -- para reconexões
  status TEXT NOT NULL DEFAULT 'token_created'
    CHECK (status IN ('token_created','item_linked','completed','expired','failed','cancelled')),
  pluggy_item_id TEXT, -- preenchido após webhook
  token_expires_at TIMESTAMPTZ,
  last_error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 minutes')
);

CREATE INDEX idx_pv2_req_company ON public.pluggy_v2_connect_requests(company_id, created_at DESC);
CREATE INDEX idx_pv2_req_status ON public.pluggy_v2_connect_requests(status) WHERE status IN ('token_created','item_linked');
CREATE INDEX idx_pv2_req_item ON public.pluggy_v2_connect_requests(pluggy_item_id) WHERE pluggy_item_id IS NOT NULL;

GRANT SELECT ON public.pluggy_v2_connect_requests TO authenticated;
GRANT ALL ON public.pluggy_v2_connect_requests TO service_role;
ALTER TABLE public.pluggy_v2_connect_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pv2_req_super_admin_read"
  ON public.pluggy_v2_connect_requests FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "pv2_req_service_role_all"
  ON public.pluggy_v2_connect_requests FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =========================================================
-- 2. pluggy_v2_connections
-- Item Pluggy materializado por webhook
-- =========================================================
CREATE TABLE public.pluggy_v2_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  pluggy_item_id TEXT NOT NULL UNIQUE,
  connector_id INTEGER NOT NULL,
  connector_name TEXT,
  connector_type TEXT, -- PERSONAL_BANK, BUSINESS_BANK, etc
  connector_country TEXT,
  status public.pluggy_v2_connection_status NOT NULL DEFAULT 'created',
  execution_status TEXT,
  status_detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  credentials_expires_at TIMESTAMPTZ,
  next_auto_sync_at TIMESTAMPTZ,
  last_updated_at TIMESTAMPTZ, -- do Pluggy
  last_sync_at TIMESTAMPTZ, -- nosso
  mfa_pending BOOLEAN NOT NULL DEFAULT false,
  is_oauth BOOLEAN NOT NULL DEFAULT false,
  parameter JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- soft delete + retry remoto
  deleted_at TIMESTAMPTZ,
  remote_deletion_status TEXT DEFAULT 'not_requested'
    CHECK (remote_deletion_status IN ('not_requested','pending','processing','done','failed','dead_letter')),
  remote_deletion_attempts INTEGER NOT NULL DEFAULT 0,
  remote_deletion_next_at TIMESTAMPTZ,
  remote_deletion_last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pv2_conn_company ON public.pluggy_v2_connections(company_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_pv2_conn_status ON public.pluggy_v2_connections(status);
CREATE INDEX idx_pv2_conn_next_sync ON public.pluggy_v2_connections(next_auto_sync_at) WHERE deleted_at IS NULL AND next_auto_sync_at IS NOT NULL;
CREATE INDEX idx_pv2_conn_remote_delete ON public.pluggy_v2_connections(remote_deletion_next_at) WHERE remote_deletion_status IN ('pending','failed');

GRANT SELECT ON public.pluggy_v2_connections TO authenticated;
GRANT ALL ON public.pluggy_v2_connections TO service_role;
ALTER TABLE public.pluggy_v2_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pv2_conn_super_admin_read"
  ON public.pluggy_v2_connections FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "pv2_conn_service_role_all"
  ON public.pluggy_v2_connections FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =========================================================
-- 3. pluggy_v2_accounts
-- Contas sincronizadas com máscara em dados sensíveis
-- =========================================================
CREATE TABLE public.pluggy_v2_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  connection_id UUID NOT NULL REFERENCES public.pluggy_v2_connections(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  pluggy_account_id TEXT NOT NULL UNIQUE,
  pluggy_item_id TEXT NOT NULL,
  type TEXT, -- BANK, CREDIT
  subtype TEXT,
  name TEXT,
  marketing_name TEXT,
  number_masked TEXT, -- ***1234
  owner_masked TEXT, -- somente iniciais/ofuscado
  tax_number_masked TEXT, -- CPF/CNPJ mascarado ***.***.***-99
  balance NUMERIC(18,2),
  currency_code TEXT DEFAULT 'BRL',
  bank_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  credit_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- shadow mode: link para conta financeira real após promoção
  promoted_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  promoted_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pv2_acc_connection ON public.pluggy_v2_accounts(connection_id);
CREATE INDEX idx_pv2_acc_company ON public.pluggy_v2_accounts(company_id);
CREATE INDEX idx_pv2_acc_promoted ON public.pluggy_v2_accounts(promoted_account_id) WHERE promoted_account_id IS NOT NULL;

GRANT SELECT ON public.pluggy_v2_accounts TO authenticated;
GRANT ALL ON public.pluggy_v2_accounts TO service_role;
ALTER TABLE public.pluggy_v2_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pv2_acc_super_admin_read"
  ON public.pluggy_v2_accounts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "pv2_acc_service_role_all"
  ON public.pluggy_v2_accounts FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =========================================================
-- 4. pluggy_v2_transactions_raw
-- Staging antes de promoção; nunca lançado direto no financeiro
-- =========================================================
CREATE TABLE public.pluggy_v2_transactions_raw (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.pluggy_v2_accounts(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES public.pluggy_v2_connections(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  pluggy_transaction_id TEXT NOT NULL UNIQUE,
  pluggy_account_id TEXT NOT NULL,
  amount NUMERIC(18,2) NOT NULL,
  amount_in_account_currency NUMERIC(18,2),
  currency_code TEXT DEFAULT 'BRL',
  description TEXT,
  description_raw TEXT,
  category TEXT,
  category_id TEXT,
  type TEXT, -- DEBIT/CREDIT
  status TEXT, -- POSTED/PENDING
  date DATE NOT NULL,
  balance NUMERIC(18,2),
  merchant JSONB,
  payment_data JSONB,
  credit_card_metadata JSONB,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- promoção shadow → financeiro
  promoted_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  promoted_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  ignored BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pv2_tx_account_date ON public.pluggy_v2_transactions_raw(account_id, date DESC);
CREATE INDEX idx_pv2_tx_company_date ON public.pluggy_v2_transactions_raw(company_id, date DESC);
CREATE INDEX idx_pv2_tx_promoted ON public.pluggy_v2_transactions_raw(promoted_transaction_id) WHERE promoted_transaction_id IS NOT NULL;
CREATE INDEX idx_pv2_tx_pending_review ON public.pluggy_v2_transactions_raw(company_id, date DESC)
  WHERE promoted_transaction_id IS NULL AND ignored = false;

GRANT SELECT ON public.pluggy_v2_transactions_raw TO authenticated;
GRANT ALL ON public.pluggy_v2_transactions_raw TO service_role;
ALTER TABLE public.pluggy_v2_transactions_raw ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pv2_tx_super_admin_read"
  ON public.pluggy_v2_transactions_raw FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "pv2_tx_service_role_all"
  ON public.pluggy_v2_transactions_raw FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =========================================================
-- 5. pluggy_v2_sync_runs
-- Auditoria de sincronizações com cursor
-- =========================================================
CREATE TABLE public.pluggy_v2_sync_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  connection_id UUID NOT NULL REFERENCES public.pluggy_v2_connections(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  triggered_by TEXT NOT NULL DEFAULT 'webhook'
    CHECK (triggered_by IN ('webhook','manual','cron','initial','reconnect')),
  source_webhook_event_id UUID, -- idempotência
  status public.pluggy_v2_sync_status NOT NULL DEFAULT 'pending',
  cursor_before TEXT,
  cursor_after TEXT,
  pages_processed INTEGER NOT NULL DEFAULT 0,
  transactions_ingested INTEGER NOT NULL DEFAULT 0,
  accounts_synced INTEGER NOT NULL DEFAULT 0,
  from_date DATE,
  to_date DATE,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  error_message TEXT,
  error_details JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pv2_sync_connection ON public.pluggy_v2_sync_runs(connection_id, created_at DESC);
CREATE INDEX idx_pv2_sync_status ON public.pluggy_v2_sync_runs(status) WHERE status IN ('pending','running');
CREATE UNIQUE INDEX uq_pv2_sync_webhook_event ON public.pluggy_v2_sync_runs(source_webhook_event_id)
  WHERE source_webhook_event_id IS NOT NULL;

GRANT SELECT ON public.pluggy_v2_sync_runs TO authenticated;
GRANT ALL ON public.pluggy_v2_sync_runs TO service_role;
ALTER TABLE public.pluggy_v2_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pv2_sync_super_admin_read"
  ON public.pluggy_v2_sync_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "pv2_sync_service_role_all"
  ON public.pluggy_v2_sync_runs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =========================================================
-- 6. pluggy_v2_webhook_events
-- Fila durável com claim atômico, retry exponencial e DLQ
-- =========================================================
CREATE TABLE public.pluggy_v2_webhook_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id TEXT, -- id vindo do payload (para dedup)
  event_type TEXT NOT NULL,
  pluggy_item_id TEXT,
  triggered_by TEXT,
  payload JSONB NOT NULL,
  headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status public.pluggy_v2_webhook_status NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 8,
  claimed_by TEXT,
  claim_expires_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_attempt_at TIMESTAMPTZ,
  last_error TEXT,
  processed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_pv2_wh_event_id ON public.pluggy_v2_webhook_events(event_id) WHERE event_id IS NOT NULL;
CREATE INDEX idx_pv2_wh_pending ON public.pluggy_v2_webhook_events(next_attempt_at, status)
  WHERE status = 'pending';
CREATE INDEX idx_pv2_wh_claim_expired ON public.pluggy_v2_webhook_events(claim_expires_at)
  WHERE status = 'processing';
CREATE INDEX idx_pv2_wh_item ON public.pluggy_v2_webhook_events(pluggy_item_id) WHERE pluggy_item_id IS NOT NULL;
CREATE INDEX idx_pv2_wh_status_created ON public.pluggy_v2_webhook_events(status, created_at DESC);

-- Sem grants para authenticated: fila é interna, apenas service_role e super_admin (via função) leem
GRANT ALL ON public.pluggy_v2_webhook_events TO service_role;
ALTER TABLE public.pluggy_v2_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pv2_wh_super_admin_read"
  ON public.pluggy_v2_webhook_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "pv2_wh_service_role_all"
  ON public.pluggy_v2_webhook_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =========================================================
-- Trigger genérica de updated_at para todas as 6 tabelas V2
-- (reusa public.dp_set_updated_at se existir; senão cria uma)
-- =========================================================
CREATE OR REPLACE FUNCTION public.pluggy_v2_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_pv2_req_updated BEFORE UPDATE ON public.pluggy_v2_connect_requests
  FOR EACH ROW EXECUTE FUNCTION public.pluggy_v2_set_updated_at();
CREATE TRIGGER trg_pv2_conn_updated BEFORE UPDATE ON public.pluggy_v2_connections
  FOR EACH ROW EXECUTE FUNCTION public.pluggy_v2_set_updated_at();
CREATE TRIGGER trg_pv2_acc_updated BEFORE UPDATE ON public.pluggy_v2_accounts
  FOR EACH ROW EXECUTE FUNCTION public.pluggy_v2_set_updated_at();
CREATE TRIGGER trg_pv2_tx_updated BEFORE UPDATE ON public.pluggy_v2_transactions_raw
  FOR EACH ROW EXECUTE FUNCTION public.pluggy_v2_set_updated_at();
CREATE TRIGGER trg_pv2_sync_updated BEFORE UPDATE ON public.pluggy_v2_sync_runs
  FOR EACH ROW EXECUTE FUNCTION public.pluggy_v2_set_updated_at();
CREATE TRIGGER trg_pv2_wh_updated BEFORE UPDATE ON public.pluggy_v2_webhook_events
  FOR EACH ROW EXECUTE FUNCTION public.pluggy_v2_set_updated_at();