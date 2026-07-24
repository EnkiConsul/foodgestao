
-- =============================================================================
-- BLOCO 2 — Open Finance Pluggy: banco, RLS, GRANTs, RPCs e ajuste DRE
-- (Nota: as colunas de override no dre_snapshots serão adicionadas quando o
--  módulo DRE for restaurado — a tabela dre_snapshots atualmente não existe.)
-- =============================================================================

-- 1.1 open_finance_connection_requests -----------------------------------------
CREATE TABLE public.open_finance_connection_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'pluggy',
  mode text NOT NULL CHECK (mode IN ('create','update','renew_consent')),
  existing_connection_id uuid NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','token_created','item_created','completed','expired','failed')),
  expires_at timestamptz NOT NULL,
  used_at timestamptz NULL,
  completed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.open_finance_connection_requests TO authenticated;
GRANT ALL ON public.open_finance_connection_requests TO service_role;
ALTER TABLE public.open_finance_connection_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "of_req_select_members"
  ON public.open_finance_connection_requests FOR SELECT TO authenticated
  USING (private.is_company_member(auth.uid(), company_id));
CREATE POLICY "of_req_insert_admin"
  ON public.open_finance_connection_requests FOR INSERT TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND private.is_company_admin_or_owner(auth.uid(), company_id)
  );
CREATE POLICY "of_req_update_admin"
  ON public.open_finance_connection_requests FOR UPDATE TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id))
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));

CREATE INDEX of_req_company_status_idx
  ON public.open_finance_connection_requests(company_id, status);


-- 1.2 open_finance_connections -------------------------------------------------
CREATE TABLE public.open_finance_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'pluggy',
  provider_item_id text NOT NULL,
  connection_request_id uuid NULL REFERENCES public.open_finance_connection_requests(id) ON DELETE SET NULL,
  connected_by_user_id uuid NOT NULL REFERENCES auth.users(id),

  connector_id text NULL,
  institution_name text NULL,
  institution_logo_url text NULL,
  institution_primary_color text NULL,
  connector_status text NULL,
  is_open_finance boolean NOT NULL DEFAULT false,

  item_status text NULL,
  execution_status text NULL,
  provider_error_code text NULL,
  provider_error_message text NULL,

  products jsonb NOT NULL DEFAULT '[]'::jsonb,

  last_sync_at timestamptz NULL,
  last_successful_sync_at timestamptz NULL,
  next_auto_sync_at timestamptz NULL,

  sync_lock_token uuid NULL,
  sync_locked_at timestamptz NULL,
  sync_locked_until timestamptz NULL,
  sync_locked_by text NULL,

  is_active boolean NOT NULL DEFAULT true,
  disconnected_at timestamptz NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT open_finance_connections_provider_item_uk UNIQUE (provider, provider_item_id)
);
GRANT SELECT ON public.open_finance_connections TO authenticated;
GRANT ALL ON public.open_finance_connections TO service_role;
ALTER TABLE public.open_finance_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "of_conn_select_members"
  ON public.open_finance_connections FOR SELECT TO authenticated
  USING (private.is_company_member(auth.uid(), company_id));

CREATE INDEX of_conn_company_active_idx
  ON public.open_finance_connections(company_id, is_active);


-- 1.3 open_finance_accounts ----------------------------------------------------
CREATE TABLE public.open_finance_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.open_finance_connections(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'pluggy',
  provider_account_id text NOT NULL,

  provider_type text NOT NULL,
  provider_subtype text NULL,
  provider_name text NULL,
  provider_marketing_name text NULL,
  provider_number_masked text NULL,
  currency_code text NULL,

  provider_balance numeric NULL,
  available_balance numeric NULL,

  credit_limit numeric NULL,
  available_credit_limit numeric NULL,
  balance_close_date date NULL,
  balance_due_date date NULL,
  card_brand text NULL,

  local_account_id uuid NULL REFERENCES public.accounts(id) ON DELETE SET NULL,
  local_credit_card_id uuid NULL REFERENCES public.credit_cards(id) ON DELETE SET NULL,

  ownership_status text NOT NULL DEFAULT 'unknown'
    CHECK (ownership_status IN ('unknown','matched','mismatch','pending_review')),
  owner_document_hash text NULL,
  owner_document_last4 text NULL,

  auto_import boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,

  sync_cursor_created_at timestamptz NULL,
  last_synced_at timestamptz NULL,
  last_transaction_date date NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT open_finance_accounts_conn_provider_uk UNIQUE (connection_id, provider_account_id),
  CONSTRAINT open_finance_accounts_binding_ck CHECK (
    (provider_type = 'BANK'   AND local_credit_card_id IS NULL) OR
    (provider_type = 'CREDIT' AND local_account_id     IS NULL) OR
    (provider_type NOT IN ('BANK','CREDIT'))
  )
);
GRANT SELECT ON public.open_finance_accounts TO authenticated;
GRANT ALL ON public.open_finance_accounts TO service_role;
ALTER TABLE public.open_finance_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "of_acc_select_members"
  ON public.open_finance_accounts FOR SELECT TO authenticated
  USING (private.is_company_member(auth.uid(), company_id));

CREATE INDEX of_acc_company_idx ON public.open_finance_accounts(company_id);
CREATE INDEX of_acc_conn_idx    ON public.open_finance_accounts(connection_id);


-- 1.4 open_finance_consents ----------------------------------------------------
CREATE TABLE public.open_finance_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.open_finance_connections(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'pluggy',
  provider_consent_id text NOT NULL,
  products jsonb NOT NULL DEFAULT '[]'::jsonb,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at_provider timestamptz NULL,
  expires_at timestamptz NULL,
  revoked_at timestamptz NULL,
  raw_metadata jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT open_finance_consents_provider_uk UNIQUE (provider, provider_consent_id)
);
GRANT SELECT ON public.open_finance_consents TO authenticated;
GRANT ALL ON public.open_finance_consents TO service_role;
ALTER TABLE public.open_finance_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "of_cons_select_members"
  ON public.open_finance_consents FOR SELECT TO authenticated
  USING (private.is_company_member(auth.uid(), company_id));


-- 1.5 open_finance_transactions_raw (staging) — backend only -------------------
CREATE TABLE public.open_finance_transactions_raw (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  connection_id uuid NOT NULL REFERENCES public.open_finance_connections(id) ON DELETE CASCADE,
  open_finance_account_id uuid NOT NULL REFERENCES public.open_finance_accounts(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'pluggy',
  provider_transaction_id text NOT NULL,

  provider_type text NULL,
  provider_status text NULL,
  provider_category_id text NULL,
  provider_category_name text NULL,
  provider_code text NULL,
  operation_type text NULL,

  transaction_date timestamptz NOT NULL,
  provider_created_at timestamptz NULL,
  amount numeric NOT NULL,
  currency_code text NULL,

  description text NULL,
  description_raw text NULL,

  merchant jsonb NULL,
  payment_data jsonb NULL,
  credit_card_metadata jsonb NULL,
  raw_payload jsonb NOT NULL,

  mapped_transaction_id uuid NULL,
  mapping_status text NOT NULL DEFAULT 'pending'
    CHECK (mapping_status IN ('pending','mapped','review','ignored','error','deleted')),
  mapping_error text NULL,
  provider_deleted_at timestamptz NULL,

  first_received_at timestamptz NOT NULL DEFAULT now(),
  last_received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT open_finance_tx_raw_provider_uk UNIQUE (connection_id, provider_transaction_id)
);
GRANT ALL ON public.open_finance_transactions_raw TO service_role;
ALTER TABLE public.open_finance_transactions_raw ENABLE ROW LEVEL SECURITY;
-- Sem policies para authenticated/anon -> acesso somente por service_role.

CREATE INDEX of_txraw_account_date_idx
  ON public.open_finance_transactions_raw(open_finance_account_id, transaction_date DESC);
CREATE INDEX of_txraw_mapping_status_idx
  ON public.open_finance_transactions_raw(mapping_status)
  WHERE mapping_status IN ('pending','review','error');


-- 1.6 open_finance_webhook_events — backend only -------------------------------
CREATE TABLE public.open_finance_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'pluggy',
  event_id text NOT NULL,
  event_type text NOT NULL,
  provider_item_id text NULL,
  provider_account_id text NULL,
  connection_id uuid NULL REFERENCES public.open_finance_connections(id) ON DELETE SET NULL,
  company_id uuid NULL,
  client_user_id text NULL,
  triggered_by text NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','processed','ignored','retry','failed')),
  attempt_count integer NOT NULL DEFAULT 0,
  received_at timestamptz NOT NULL DEFAULT now(),
  processing_started_at timestamptz NULL,
  processed_at timestamptz NULL,
  next_attempt_at timestamptz NULL,
  error text NULL,
  CONSTRAINT open_finance_webhook_events_uk UNIQUE (provider, event_id)
);
GRANT ALL ON public.open_finance_webhook_events TO service_role;
ALTER TABLE public.open_finance_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX of_webhook_status_next_idx
  ON public.open_finance_webhook_events(status, next_attempt_at NULLS FIRST)
  WHERE status IN ('pending','retry');


-- 1.7 open_finance_sync_runs ---------------------------------------------------
CREATE TABLE public.open_finance_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.open_finance_connections(id) ON DELETE CASCADE,
  trigger text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NULL,

  accounts_found integer NOT NULL DEFAULT 0,
  accounts_created integer NOT NULL DEFAULT 0,
  accounts_updated integer NOT NULL DEFAULT 0,

  transactions_found integer NOT NULL DEFAULT 0,
  transactions_created integer NOT NULL DEFAULT 0,
  transactions_updated integer NOT NULL DEFAULT 0,
  transactions_canceled integer NOT NULL DEFAULT 0,
  transactions_ignored integer NOT NULL DEFAULT 0,
  transactions_review integer NOT NULL DEFAULT 0,

  error_count integer NOT NULL DEFAULT 0,
  per_account jsonb NULL,
  error_summary jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.open_finance_sync_runs TO authenticated;
GRANT ALL ON public.open_finance_sync_runs TO service_role;
ALTER TABLE public.open_finance_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "of_sync_select_members"
  ON public.open_finance_sync_runs FOR SELECT TO authenticated
  USING (private.is_company_member(auth.uid(), company_id));

CREATE INDEX of_sync_conn_started_idx
  ON public.open_finance_sync_runs(connection_id, started_at DESC);


-- 2) TRIGGERS updated_at
CREATE TRIGGER trg_of_conn_updated_at BEFORE UPDATE ON public.open_finance_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_of_acc_updated_at BEFORE UPDATE ON public.open_finance_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_of_cons_updated_at BEFORE UPDATE ON public.open_finance_consents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_of_txraw_updated_at BEFORE UPDATE ON public.open_finance_transactions_raw
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- 3) COLUNAS ADICIONAIS EM public.transactions
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS connection_account_id uuid NULL
    REFERENCES public.open_finance_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provider_status text NULL,
  ADD COLUMN IF NOT EXISTS provider_category text NULL,
  ADD COLUMN IF NOT EXISTS counterparty_name text NULL,
  ADD COLUMN IF NOT EXISTS counterparty_cnpj text NULL,
  ADD COLUMN IF NOT EXISTS counterparty_document_hash text NULL,
  ADD COLUMN IF NOT EXISTS counterparty_document_last4 text NULL,
  ADD COLUMN IF NOT EXISTS payment_method_provider text NULL,
  ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_reason text NULL,
  ADD COLUMN IF NOT EXISTS pairing_status text NULL,
  ADD COLUMN IF NOT EXISTS pairing_started_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS pairing_expires_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS exclude_from_results boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS canceled_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS cancel_reason text NULL,
  ADD COLUMN IF NOT EXISTS superseded_by_transaction_id uuid NULL
    REFERENCES public.transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provider_last_updated_at timestamptz NULL;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_open_finance_external_uidx
  ON public.transactions (connection_account_id, external_id)
  WHERE connection_account_id IS NOT NULL AND external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS transactions_counterparty_cnpj_idx
  ON public.transactions (company_id, counterparty_cnpj)
  WHERE counterparty_cnpj IS NOT NULL;

CREATE INDEX IF NOT EXISTS transactions_pairing_waiting_idx
  ON public.transactions (company_id, pairing_expires_at)
  WHERE pairing_status = 'waiting';

CREATE INDEX IF NOT EXISTS transactions_exclude_from_results_idx
  ON public.transactions (company_id, exclude_from_results)
  WHERE exclude_from_results = true;


-- 4) RPCs — LOCK COOPERATIVO POR CONEXÃO
CREATE OR REPLACE FUNCTION public.claim_open_finance_sync(
  _connection_id uuid, _locked_by text, _ttl_seconds integer DEFAULT 300
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _token uuid := gen_random_uuid(); _updated int;
BEGIN
  UPDATE public.open_finance_connections
     SET sync_lock_token = _token, sync_locked_at = now(),
         sync_locked_until = now() + make_interval(secs => _ttl_seconds),
         sync_locked_by = _locked_by, updated_at = now()
   WHERE id = _connection_id
     AND (sync_locked_until IS NULL OR sync_locked_until < now());
  GET DIAGNOSTICS _updated = ROW_COUNT;
  IF _updated = 0 THEN RETURN NULL; END IF;
  RETURN _token;
END $$;
REVOKE ALL ON FUNCTION public.claim_open_finance_sync(uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_open_finance_sync(uuid, text, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.release_open_finance_sync(_connection_id uuid, _token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _updated int;
BEGIN
  UPDATE public.open_finance_connections
     SET sync_lock_token = NULL, sync_locked_at = NULL,
         sync_locked_until = NULL, sync_locked_by = NULL, updated_at = now()
   WHERE id = _connection_id AND sync_lock_token = _token;
  GET DIAGNOSTICS _updated = ROW_COUNT;
  RETURN _updated > 0;
END $$;
REVOKE ALL ON FUNCTION public.release_open_finance_sync(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_open_finance_sync(uuid, uuid) TO service_role;


-- 5) RPC — INGESTÃO IDEMPOTENTE (com proteção anti-ressurreição)
CREATE OR REPLACE FUNCTION public.ingest_of_transaction(_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _company_id            uuid := (_payload->>'company_id')::uuid;
  _connection_account_id uuid := (_payload->>'connection_account_id')::uuid;
  _external_id           text := _payload->>'external_id';
  _amount                numeric := (_payload->>'amount')::numeric;
  _tx_type               text := _payload->>'transaction_type';
  _account_id            uuid := NULLIF(_payload->>'account_id','')::uuid;
  _credit_card_id        uuid := NULLIF(_payload->>'credit_card_id','')::uuid;
  _description           text := _payload->>'description';
  _transaction_date      date := (_payload->>'transaction_date')::date;
  _status                text := COALESCE(_payload->>'status','confirmado');
  _existing              public.transactions%ROWTYPE;
  _tx_id                 uuid;
BEGIN
  IF _company_id IS NULL OR _connection_account_id IS NULL OR _external_id IS NULL THEN
    RAISE EXCEPTION 'company_id, connection_account_id e external_id são obrigatórios' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _existing FROM public.transactions
   WHERE connection_account_id = _connection_account_id AND external_id = _external_id LIMIT 1;

  -- Proteção anti-ressurreição
  IF _existing.id IS NOT NULL
     AND _existing.status::text = 'cancelado'
     AND _existing.cancel_reason = 'Consolidado em transferência entre contas próprias' THEN
    UPDATE public.transactions
       SET provider_last_updated_at = COALESCE(NULLIF(_payload->>'provider_last_updated_at','')::timestamptz, now()),
           provider_status = COALESCE(_payload->>'provider_status', provider_status),
           updated_at = now()
     WHERE id = _existing.id;
    RETURN _existing.id;
  END IF;

  IF _existing.id IS NULL THEN
    INSERT INTO public.transactions (
      user_id, company_id, context,
      description, amount, transaction_type, transaction_date,
      account_id, credit_card_id, status,
      connection_account_id, external_id,
      provider_status, provider_category, provider_last_updated_at,
      counterparty_name, counterparty_cnpj,
      counterparty_document_hash, counterparty_document_last4,
      payment_method_provider,
      pairing_status, pairing_started_at, pairing_expires_at,
      exclude_from_results, needs_review, review_reason, is_invoice_payment
    ) VALUES (
      NULLIF(_payload->>'user_id','')::uuid,
      _company_id, 'pj'::context_type,
      _description, abs(_amount), _tx_type::transaction_type, _transaction_date,
      _account_id, _credit_card_id, _status::transaction_status,
      _connection_account_id, _external_id,
      _payload->>'provider_status', _payload->>'provider_category',
      NULLIF(_payload->>'provider_last_updated_at','')::timestamptz,
      _payload->>'counterparty_name', _payload->>'counterparty_cnpj',
      _payload->>'counterparty_document_hash', _payload->>'counterparty_document_last4',
      _payload->>'payment_method_provider',
      _payload->>'pairing_status',
      NULLIF(_payload->>'pairing_started_at','')::timestamptz,
      NULLIF(_payload->>'pairing_expires_at','')::timestamptz,
      COALESCE((_payload->>'exclude_from_results')::boolean, false),
      COALESCE((_payload->>'needs_review')::boolean, false),
      _payload->>'review_reason',
      COALESCE((_payload->>'is_invoice_payment')::boolean, false)
    ) RETURNING id INTO _tx_id;
  ELSE
    UPDATE public.transactions
       SET description = COALESCE(_description, description),
           provider_status = COALESCE(_payload->>'provider_status', provider_status),
           provider_category = COALESCE(_payload->>'provider_category', provider_category),
           provider_last_updated_at = COALESCE(NULLIF(_payload->>'provider_last_updated_at','')::timestamptz, provider_last_updated_at),
           counterparty_name = COALESCE(_payload->>'counterparty_name', counterparty_name),
           counterparty_cnpj = COALESCE(_payload->>'counterparty_cnpj', counterparty_cnpj),
           updated_at = now()
     WHERE id = _existing.id
     RETURNING id INTO _tx_id;
  END IF;

  RETURN _tx_id;
END $$;
REVOKE ALL ON FUNCTION public.ingest_of_transaction(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_of_transaction(jsonb) TO service_role;


-- 6) RPC — PROMOTE_TO_TRANSFER
CREATE OR REPLACE FUNCTION public.promote_to_transfer(
  _outbound_tx_id uuid, _inbound_tx_id uuid, _destination_account_id uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _out public.transactions%ROWTYPE; _in public.transactions%ROWTYPE;
BEGIN
  SELECT * INTO _out FROM public.transactions WHERE id = _outbound_tx_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Outbound transaction not found' USING ERRCODE = '22023'; END IF;

  UPDATE public.transactions
     SET transaction_type = 'transferencia'::transaction_type,
         destination_account_id = _destination_account_id,
         pairing_status = 'matched', pairing_expires_at = NULL,
         exclude_from_results = false, needs_review = false, review_reason = NULL,
         updated_at = now()
   WHERE id = _outbound_tx_id;

  IF _inbound_tx_id IS NOT NULL THEN
    SELECT * INTO _in FROM public.transactions WHERE id = _inbound_tx_id FOR UPDATE;
    IF FOUND AND _in.id <> _outbound_tx_id THEN
      UPDATE public.transactions
         SET status = 'cancelado'::transaction_status,
             canceled_at = now(),
             cancel_reason = 'Consolidado em transferência entre contas próprias',
             superseded_by_transaction_id = _outbound_tx_id,
             exclude_from_results = true, pairing_status = 'consolidated',
             updated_at = now()
       WHERE id = _inbound_tx_id;
    END IF;
  END IF;

  IF _out.account_id IS NOT NULL THEN PERFORM public.recompute_account_balance(_out.account_id); END IF;
  IF _destination_account_id IS NOT NULL THEN PERFORM public.recompute_account_balance(_destination_account_id); END IF;

  RETURN _outbound_tx_id;
END $$;
REVOKE ALL ON FUNCTION public.promote_to_transfer(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promote_to_transfer(uuid, uuid, uuid) TO service_role;


-- 7) RPC — PAIR_RETRO_TRANSFERS (janela de 5 dias)
CREATE OR REPLACE FUNCTION public.pair_retro_transfers(
  _company_id uuid, _connection_id uuid DEFAULT NULL
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _paired int := 0; _rec record; _candidate uuid; _dest uuid;
BEGIN
  FOR _rec IN
    SELECT t.id, t.account_id, t.amount, t.transaction_date
      FROM public.transactions t
     WHERE t.company_id = _company_id
       AND t.pairing_status = 'waiting'
       AND t.pairing_expires_at >= now()
       AND t.transaction_type = 'despesa'::transaction_type
       AND (_connection_id IS NULL OR t.connection_account_id IN (
              SELECT id FROM public.open_finance_accounts WHERE connection_id = _connection_id))
     ORDER BY t.transaction_date ASC
  LOOP
    SELECT t2.id, t2.account_id INTO _candidate, _dest
      FROM public.transactions t2
     WHERE t2.company_id = _company_id
       AND t2.pairing_status = 'waiting'
       AND t2.transaction_type = 'receita'::transaction_type
       AND t2.amount = _rec.amount
       AND t2.account_id <> _rec.account_id
       AND abs(extract(epoch FROM (t2.transaction_date::timestamp - _rec.transaction_date::timestamp))) <= 5 * 86400
     ORDER BY abs(extract(epoch FROM (t2.transaction_date::timestamp - _rec.transaction_date::timestamp))) ASC
     LIMIT 1;
    IF _candidate IS NOT NULL THEN
      PERFORM public.promote_to_transfer(_rec.id, _candidate, _dest);
      _paired := _paired + 1;
      _candidate := NULL; _dest := NULL;
    END IF;
  END LOOP;
  RETURN _paired;
END $$;
REVOKE ALL ON FUNCTION public.pair_retro_transfers(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pair_retro_transfers(uuid, uuid) TO service_role;


-- 8) RPC — EXPIRE_TRANSFER_CANDIDATES
CREATE OR REPLACE FUNCTION public.expire_transfer_candidates(_company_id uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _expired int := 0; _rec record; _strong boolean;
BEGIN
  FOR _rec IN
    SELECT id, company_id, description, counterparty_cnpj
      FROM public.transactions
     WHERE pairing_status = 'waiting'
       AND pairing_expires_at < now()
       AND (_company_id IS NULL OR company_id = _company_id)
  LOOP
    _strong := COALESCE(_rec.description ~* '\m(transf(er[eê]ncia)?|entre contas|entre minhas contas)\M', false)
               OR (_rec.counterparty_cnpj IS NOT NULL);
    IF _strong THEN
      UPDATE public.transactions
         SET pairing_status = 'expired_review', pairing_expires_at = NULL,
             needs_review = true, review_reason = 'transferencia_sem_par_expirada',
             exclude_from_results = true, updated_at = now()
       WHERE id = _rec.id;
    ELSE
      UPDATE public.transactions
         SET pairing_status = 'expired_finalized', pairing_expires_at = NULL,
             needs_review = false, review_reason = NULL,
             exclude_from_results = false, updated_at = now()
       WHERE id = _rec.id;
    END IF;
    _expired := _expired + 1;
  END LOOP;
  RETURN _expired;
END $$;
REVOKE ALL ON FUNCTION public.expire_transfer_candidates(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_transfer_candidates(uuid) TO service_role;


-- 9) PATCH — dre_generate ignora exclude_from_results
CREATE OR REPLACE FUNCTION public.dre_generate(
  _company_id uuid, _from date, _to date, _regime text DEFAULT 'caixa'
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _rubricas jsonb;
  _receita_bruta numeric := 0; _deducoes numeric := 0; _custos numeric := 0;
  _desp_vendas numeric := 0; _desp_admin numeric := 0; _outras_desp numeric := 0;
  _outras_rec numeric := 0; _rec_fin numeric := 0; _desp_fin numeric := 0;
  _provisoes numeric := 0;
  _rec_liq numeric; _lucro_bruto numeric; _ebit numeric; _res_fin numeric;
  _lair numeric; _lucro_liq numeric;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF NOT private.is_company_member(_uid, _company_id) THEN
    RAISE EXCEPTION 'Not a company member' USING ERRCODE = '42501';
  END IF;
  IF _regime NOT IN ('caixa','competencia') THEN
    RAISE EXCEPTION 'Regime inválido' USING ERRCODE = '22023';
  END IF;

  WITH tx AS (
    SELECT t.category_id,
           CASE WHEN _regime = 'caixa' THEN COALESCE(NULLIF(t.amount_paid,0), t.amount)
                ELSE t.amount END AS valor
    FROM public.transactions t
    WHERE t.company_id = _company_id
      AND t.context = 'pj'
      AND t.status::text <> 'cancelado'
      AND t.transaction_type::text <> 'transferencia'
      AND COALESCE(t.exclude_from_results, false) = false
      AND ((_regime = 'caixa' AND t.payment_date BETWEEN _from AND _to)
        OR (_regime = 'competencia' AND COALESCE(t.due_date, t.transaction_date) BETWEEN _from AND _to))
  ),
  agg AS (
    SELECT m.rubrica_id, SUM(tx.valor * (m.percentual_alocacao/100.0))::numeric(15,2) AS total
    FROM tx JOIN public.dre_categoria_mapeamento m
      ON m.categoria_id = tx.category_id AND m.company_id = _company_id
    GROUP BY m.rubrica_id
  ),
  ajustes AS (
    SELECT a.rubrica_id,
           SUM(CASE WHEN a.tipo_ajuste = 'adicionar' THEN a.valor
                    WHEN a.tipo_ajuste = 'subtrair' THEN -a.valor ELSE 0 END)::numeric(15,2) AS ajuste_valor,
           MAX(CASE WHEN a.tipo_ajuste = 'substituir' THEN a.valor END)::numeric(15,2) AS substituir_valor,
           COUNT(*) AS qt_ajustes
    FROM public.dre_ajustes_manuais a
    WHERE a.company_id = _company_id AND a.aprovado_em IS NOT NULL
      AND a.periodo_inicio <= _to AND a.periodo_fim >= _from
    GROUP BY a.rubrica_id
  )
  SELECT jsonb_agg(jsonb_build_object(
    'rubrica_id', r.id, 'codigo', r.codigo, 'nome', r.nome,
    'grupo_pai_codigo', r.grupo_pai_codigo, 'tipo', r.tipo,
    'natureza', r.natureza, 'is_calculada', r.is_calculada, 'ordem', r.ordem,
    'valor_base', COALESCE(ag.total, 0), 'ajuste', COALESCE(aj.ajuste_valor, 0),
    'substituir', aj.substituir_valor, 'qt_ajustes', COALESCE(aj.qt_ajustes, 0),
    'valor', COALESCE(aj.substituir_valor, COALESCE(ag.total, 0) + COALESCE(aj.ajuste_valor, 0))
  ) ORDER BY r.ordem) INTO _rubricas
  FROM public.dre_rubricas r
  LEFT JOIN agg ag ON ag.rubrica_id = r.id
  LEFT JOIN ajustes aj ON aj.rubrica_id = r.id
  WHERE r.visivel = true;

  SELECT
    COALESCE(SUM(CASE WHEN r.tipo = 'receita_bruta' THEN (item->>'valor')::numeric END), 0),
    COALESCE(SUM(CASE WHEN r.tipo = 'deducao_receita' THEN (item->>'valor')::numeric END), 0),
    COALESCE(SUM(CASE WHEN r.tipo = 'custo_servico' THEN (item->>'valor')::numeric END), 0),
    COALESCE(SUM(CASE WHEN r.tipo = 'despesa_vendas' AND r.codigo <> '4.1' THEN (item->>'valor')::numeric END), 0),
    COALESCE(SUM(CASE WHEN r.tipo = 'despesa_administrativa' AND r.codigo NOT IN ('4','4.2') THEN (item->>'valor')::numeric END), 0),
    COALESCE(SUM(CASE WHEN r.tipo = 'outras_despesas_op' THEN (item->>'valor')::numeric END), 0),
    COALESCE(SUM(CASE WHEN r.tipo = 'outras_receitas_op' AND r.codigo <> '5' THEN (item->>'valor')::numeric END), 0),
    COALESCE(SUM(CASE WHEN r.tipo = 'receita_financeira' AND r.codigo <> '6.1' THEN (item->>'valor')::numeric END), 0),
    COALESCE(SUM(CASE WHEN r.tipo = 'despesa_financeira' AND r.codigo <> '6.2' THEN (item->>'valor')::numeric END), 0),
    COALESCE(SUM(CASE WHEN r.tipo = 'provisao_irpj_csll' AND r.codigo <> '7' THEN (item->>'valor')::numeric END), 0)
  INTO _receita_bruta, _deducoes, _custos, _desp_vendas, _desp_admin,
       _outras_desp, _outras_rec, _rec_fin, _desp_fin, _provisoes
  FROM jsonb_array_elements(_rubricas) AS item
  JOIN public.dre_rubricas r ON r.id = (item->>'rubrica_id')::uuid
  WHERE r.is_calculada = false;

  _rec_liq := _receita_bruta - _deducoes;
  _lucro_bruto := _rec_liq - _custos;
  _ebit := _lucro_bruto - (_desp_vendas + _desp_admin + _outras_desp) + _outras_rec;
  _res_fin := _rec_fin - _desp_fin;
  _lair := _ebit + _res_fin;
  _lucro_liq := _lair - _provisoes;

  RETURN jsonb_build_object(
    'company_id', _company_id, 'periodo_inicio', _from, 'periodo_fim', _to,
    'regime', _regime, 'rubricas', _rubricas,
    'totais', jsonb_build_object(
      'receita_bruta', _receita_bruta, 'deducoes', _deducoes,
      'receita_liquida', _rec_liq, 'custos', _custos, 'lucro_bruto', _lucro_bruto,
      'despesas_operacionais', _desp_vendas + _desp_admin + _outras_desp,
      'outras_receitas_operacionais', _outras_rec, 'ebit', _ebit,
      'receitas_financeiras', _rec_fin, 'despesas_financeiras', _desp_fin,
      'resultado_financeiro', _res_fin, 'lair', _lair, 'provisoes', _provisoes,
      'lucro_liquido', _lucro_liq,
      'margem_bruta_pct', CASE WHEN _rec_liq > 0 THEN ROUND((_lucro_bruto / _rec_liq) * 100, 2) ELSE 0 END,
      'margem_operacional_pct', CASE WHEN _rec_liq > 0 THEN ROUND((_ebit / _rec_liq) * 100, 2) ELSE 0 END,
      'margem_liquida_pct', CASE WHEN _rec_liq > 0 THEN ROUND((_lucro_liq / _rec_liq) * 100, 2) ELSE 0 END
    )
  );
END $$;
