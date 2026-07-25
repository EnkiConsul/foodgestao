-- ============================================================
-- BLOCO 2 — Open Finance / Pluggy: base de dados + RLS + RPCs
-- ============================================================

-- 0. Coluna auxiliar em transactions (idempotente)
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS categorization_source text;

-- ============================================================
-- 1. open_finance_connections
-- ============================================================
CREATE TABLE public.open_finance_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  connected_by_user_id uuid NOT NULL REFERENCES auth.users(id),
  pluggy_item_id text NOT NULL,
  connector_id integer,
  institution_name text,
  institution_logo_url text,
  status text NOT NULL DEFAULT 'pending',
  status_detail text,
  consent_expires_at timestamptz,
  last_synced_at timestamptz,
  last_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, pluggy_item_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.open_finance_connections TO authenticated;
GRANT ALL ON public.open_finance_connections TO service_role;

ALTER TABLE public.open_finance_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "of_connections_select_members"
  ON public.open_finance_connections FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = open_finance_connections.company_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "of_connections_write_admins"
  ON public.open_finance_connections FOR ALL TO authenticated
  USING (public.is_company_admin_or_owner(auth.uid(), company_id))
  WITH CHECK (public.is_company_admin_or_owner(auth.uid(), company_id));

CREATE INDEX idx_of_connections_company ON public.open_finance_connections(company_id);
CREATE INDEX idx_of_connections_status ON public.open_finance_connections(status);

-- ============================================================
-- 2. open_finance_accounts
-- ============================================================
CREATE TABLE public.open_finance_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.open_finance_connections(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  pluggy_account_id text NOT NULL,
  local_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  type text,
  subtype text,
  name text,
  number text,
  currency text NOT NULL DEFAULT 'BRL',
  balance numeric(18,2),
  auto_import boolean NOT NULL DEFAULT true,
  ignored boolean NOT NULL DEFAULT false,
  last_transaction_at timestamptz,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, pluggy_account_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.open_finance_accounts TO authenticated;
GRANT ALL ON public.open_finance_accounts TO service_role;

ALTER TABLE public.open_finance_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "of_accounts_select_members"
  ON public.open_finance_accounts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = open_finance_accounts.company_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "of_accounts_write_admins"
  ON public.open_finance_accounts FOR ALL TO authenticated
  USING (public.is_company_admin_or_owner(auth.uid(), company_id))
  WITH CHECK (public.is_company_admin_or_owner(auth.uid(), company_id));

CREATE INDEX idx_of_accounts_company ON public.open_finance_accounts(company_id);
CREATE INDEX idx_of_accounts_local ON public.open_finance_accounts(local_account_id);

-- ============================================================
-- 3. open_finance_connection_requests
-- ============================================================
CREATE TABLE public.open_finance_connection_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  requested_by_user_id uuid NOT NULL REFERENCES auth.users(id),
  connect_token text,
  connect_token_expires_at timestamptz,
  pluggy_item_id text,
  status text NOT NULL DEFAULT 'pending',
  error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.open_finance_connection_requests TO authenticated;
GRANT ALL ON public.open_finance_connection_requests TO service_role;

ALTER TABLE public.open_finance_connection_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "of_conn_req_select_own_or_admin"
  ON public.open_finance_connection_requests FOR SELECT TO authenticated
  USING (
    requested_by_user_id = auth.uid()
    OR public.is_company_admin_or_owner(auth.uid(), company_id)
  );

CREATE POLICY "of_conn_req_write_admins"
  ON public.open_finance_connection_requests FOR ALL TO authenticated
  USING (public.is_company_admin_or_owner(auth.uid(), company_id))
  WITH CHECK (public.is_company_admin_or_owner(auth.uid(), company_id));

CREATE INDEX idx_of_conn_req_company ON public.open_finance_connection_requests(company_id);
CREATE INDEX idx_of_conn_req_status ON public.open_finance_connection_requests(status);

-- ============================================================
-- 4. open_finance_transactions_raw (staging — service_role only)
-- ============================================================
CREATE TABLE public.open_finance_transactions_raw (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.open_finance_connections(id) ON DELETE CASCADE,
  of_account_id uuid NOT NULL REFERENCES public.open_finance_accounts(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  pluggy_transaction_id text NOT NULL,
  import_hash text NOT NULL,
  raw jsonb NOT NULL,
  processed_at timestamptz,
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, import_hash),
  UNIQUE (of_account_id, pluggy_transaction_id)
);

GRANT ALL ON public.open_finance_transactions_raw TO service_role;

ALTER TABLE public.open_finance_transactions_raw ENABLE ROW LEVEL SECURITY;

CREATE POLICY "of_raw_deny_all_users"
  ON public.open_finance_transactions_raw AS RESTRICTIVE
  FOR ALL TO authenticated, anon
  USING (false) WITH CHECK (false);

CREATE INDEX idx_of_raw_company ON public.open_finance_transactions_raw(company_id);
CREATE INDEX idx_of_raw_unprocessed ON public.open_finance_transactions_raw(company_id) WHERE processed_at IS NULL;

-- ============================================================
-- 5. open_finance_sync_runs (service_role only)
-- ============================================================
CREATE TABLE public.open_finance_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.open_finance_connections(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued',
  triggered_by text NOT NULL DEFAULT 'system',
  started_at timestamptz,
  finished_at timestamptz,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  claimed_by text,
  claim_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.open_finance_sync_runs TO service_role;

ALTER TABLE public.open_finance_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "of_sync_runs_deny_all_users"
  ON public.open_finance_sync_runs AS RESTRICTIVE
  FOR ALL TO authenticated, anon
  USING (false) WITH CHECK (false);

CREATE INDEX idx_of_sync_runs_status ON public.open_finance_sync_runs(status);
CREATE INDEX idx_of_sync_runs_connection ON public.open_finance_sync_runs(connection_id);

-- ============================================================
-- 6. open_finance_webhook_events (service_role only)
-- ============================================================
CREATE TABLE public.open_finance_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text,
  event_type text NOT NULL,
  pluggy_item_id text,
  signature text,
  payload jsonb NOT NULL,
  processed_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.open_finance_webhook_events TO service_role;

ALTER TABLE public.open_finance_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "of_webhook_events_deny_all_users"
  ON public.open_finance_webhook_events AS RESTRICTIVE
  FOR ALL TO authenticated, anon
  USING (false) WITH CHECK (false);

CREATE INDEX idx_of_webhook_events_item ON public.open_finance_webhook_events(pluggy_item_id);
CREATE INDEX idx_of_webhook_events_unprocessed ON public.open_finance_webhook_events(created_at) WHERE processed_at IS NULL;

-- ============================================================
-- 7. updated_at triggers
-- ============================================================
CREATE TRIGGER trg_of_connections_updated_at
  BEFORE UPDATE ON public.open_finance_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_of_accounts_updated_at
  BEFORE UPDATE ON public.open_finance_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_of_conn_req_updated_at
  BEFORE UPDATE ON public.open_finance_connection_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_of_raw_updated_at
  BEFORE UPDATE ON public.open_finance_transactions_raw
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_of_sync_runs_updated_at
  BEFORE UPDATE ON public.open_finance_sync_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 8. RPCs (SECURITY DEFINER)
-- ============================================================

-- Locking do worker: reivindica um sync run "queued" e retorna o id
CREATE OR REPLACE FUNCTION public.claim_open_finance_sync(_worker_id text, _lock_seconds int DEFAULT 300)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  UPDATE public.open_finance_sync_runs
     SET status = 'running',
         claimed_by = _worker_id,
         claim_expires_at = now() + make_interval(secs => _lock_seconds),
         started_at = COALESCE(started_at, now())
   WHERE id = (
     SELECT id FROM public.open_finance_sync_runs
      WHERE status = 'queued'
         OR (status = 'running' AND claim_expires_at < now())
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
   )
   RETURNING id INTO _id;
  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_open_finance_sync(text, int) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.claim_open_finance_sync(text, int) TO service_role;

-- Libera lock (worker terminou / erro)
CREATE OR REPLACE FUNCTION public.release_open_finance_sync(_run_id uuid, _status text, _stats jsonb DEFAULT '{}'::jsonb, _error text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.open_finance_sync_runs
     SET status = _status,
         stats = COALESCE(_stats, '{}'::jsonb),
         error = _error,
         finished_at = now(),
         claim_expires_at = NULL
   WHERE id = _run_id;
END;
$$;

REVOKE ALL ON FUNCTION public.release_open_finance_sync(uuid, text, jsonb, text) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.release_open_finance_sync(uuid, text, jsonb, text) TO service_role;

-- Vincula uma OF account a uma account local (idempotente)
CREATE OR REPLACE FUNCTION public.link_open_finance_account(
  _of_account_id uuid,
  _local_account_id uuid,
  _auto_import boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _company_id uuid;
  _caller uuid := auth.uid();
BEGIN
  SELECT company_id INTO _company_id
    FROM public.open_finance_accounts
   WHERE id = _of_account_id;

  IF _company_id IS NULL THEN
    RAISE EXCEPTION 'open_finance_account not found';
  END IF;

  IF NOT public.is_company_admin_or_owner(_caller, _company_id) THEN
    RAISE EXCEPTION 'permission denied for company %', _company_id;
  END IF;

  -- Verifica que a conta local pertence à mesma empresa
  IF _local_account_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.accounts
       WHERE id = _local_account_id
         AND company_id = _company_id
    ) THEN
      RAISE EXCEPTION 'local account does not belong to company %', _company_id;
    END IF;
  END IF;

  UPDATE public.open_finance_accounts
     SET local_account_id = _local_account_id,
         auto_import = _auto_import,
         ignored = false
   WHERE id = _of_account_id;

  PERFORM public.insert_audit_log(
    _action := 'open_finance_account_linked',
    _entity_type := 'open_finance_account',
    _entity_id := _of_account_id::text,
    _details := jsonb_build_object(
      'local_account_id', _local_account_id,
      'auto_import', _auto_import,
      'company_id', _company_id,
      'by_user', _caller
    )
  );

  RETURN _of_account_id;
END;
$$;

REVOKE ALL ON FUNCTION public.link_open_finance_account(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_open_finance_account(uuid, uuid, boolean) TO authenticated, service_role;

-- Cria account local + vincula em uma única transação
CREATE OR REPLACE FUNCTION public.create_and_link_open_finance_account(
  _of_account_id uuid,
  _account_name text,
  _account_type public.account_type,
  _bank_slug text DEFAULT NULL,
  _initial_balance numeric DEFAULT 0,
  _auto_import boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _company_id uuid;
  _caller uuid := auth.uid();
  _new_account uuid;
BEGIN
  SELECT company_id INTO _company_id
    FROM public.open_finance_accounts
   WHERE id = _of_account_id;

  IF _company_id IS NULL THEN
    RAISE EXCEPTION 'open_finance_account not found';
  END IF;

  IF NOT public.is_company_admin_or_owner(_caller, _company_id) THEN
    RAISE EXCEPTION 'permission denied for company %', _company_id;
  END IF;

  INSERT INTO public.accounts (
    user_id, company_id, context, name, account_type,
    initial_balance, current_balance, bank_slug
  ) VALUES (
    _caller, _company_id, 'pj', _account_name, _account_type,
    COALESCE(_initial_balance, 0), COALESCE(_initial_balance, 0), _bank_slug
  )
  RETURNING id INTO _new_account;

  UPDATE public.open_finance_accounts
     SET local_account_id = _new_account,
         auto_import = _auto_import,
         ignored = false
   WHERE id = _of_account_id;

  PERFORM public.insert_audit_log(
    _action := 'open_finance_account_created_and_linked',
    _entity_type := 'open_finance_account',
    _entity_id := _of_account_id::text,
    _details := jsonb_build_object(
      'local_account_id', _new_account,
      'account_name', _account_name,
      'company_id', _company_id,
      'by_user', _caller
    )
  );

  RETURN _new_account;
END;
$$;

REVOKE ALL ON FUNCTION public.create_and_link_open_finance_account(uuid, text, public.account_type, text, numeric, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_and_link_open_finance_account(uuid, text, public.account_type, text, numeric, boolean) TO authenticated, service_role;
