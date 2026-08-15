-- =========================================================
-- SCHEMA PERSISTENTE V2 DA PLUGGY + RASTREIO EM TRANSACTIONS
-- =========================================================

-- ---------- ENUMS (idempotentes) ----------
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

-- =========================================================
-- 1. pluggy_v2_connections
-- =========================================================
CREATE TABLE IF NOT EXISTS public.pluggy_v2_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  pluggy_item_id TEXT NOT NULL UNIQUE,
  connector_id TEXT,
  connector_name TEXT,
  status public.pluggy_v2_connection_status NOT NULL DEFAULT 'created',
  execution_status TEXT,
  status_detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  credentials_expires_at TIMESTAMPTZ,
  last_updated_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pv2_conn_company ON public.pluggy_v2_connections(company_id, last_sync_at DESC);
CREATE INDEX IF NOT EXISTS idx_pv2_conn_item ON public.pluggy_v2_connections(pluggy_item_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pluggy_v2_connections TO authenticated;
GRANT ALL ON public.pluggy_v2_connections TO service_role;
ALTER TABLE public.pluggy_v2_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pv2_conn_company_all"
  ON public.pluggy_v2_connections FOR ALL TO authenticated
  USING (company_id IN (
    SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()
    UNION
    SELECT c.id FROM public.companies c WHERE c.user_id = auth.uid()
  ))
  WITH CHECK (company_id IN (
    SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()
    UNION
    SELECT c.id FROM public.companies c WHERE c.user_id = auth.uid()
  ));

CREATE POLICY "pv2_conn_service_role_all"
  ON public.pluggy_v2_connections FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =========================================================
-- 2. pluggy_v2_accounts
-- =========================================================
CREATE TABLE IF NOT EXISTS public.pluggy_v2_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  connection_id UUID NOT NULL REFERENCES public.pluggy_v2_connections(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  pluggy_account_id TEXT NOT NULL UNIQUE,
  pluggy_item_id TEXT NOT NULL,
  type TEXT,
  subtype TEXT,
  name TEXT,
  marketing_name TEXT,
  number_masked TEXT,
  owner_masked TEXT,
  tax_number_masked TEXT,
  balance NUMERIC(18,2),
  currency_code TEXT NOT NULL DEFAULT 'BRL',
  bank_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  credit_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pv2_acc_company ON public.pluggy_v2_accounts(company_id);
CREATE INDEX IF NOT EXISTS idx_pv2_acc_connection ON public.pluggy_v2_accounts(connection_id);
CREATE INDEX IF NOT EXISTS idx_pv2_acc_pluggy_account ON public.pluggy_v2_accounts(pluggy_account_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pluggy_v2_accounts TO authenticated;
GRANT ALL ON public.pluggy_v2_accounts TO service_role;
ALTER TABLE public.pluggy_v2_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pv2_acc_company_all"
  ON public.pluggy_v2_accounts FOR ALL TO authenticated
  USING (company_id IN (
    SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()
    UNION
    SELECT c.id FROM public.companies c WHERE c.user_id = auth.uid()
  ))
  WITH CHECK (company_id IN (
    SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()
    UNION
    SELECT c.id FROM public.companies c WHERE c.user_id = auth.uid()
  ));

CREATE POLICY "pv2_acc_service_role_all"
  ON public.pluggy_v2_accounts FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =========================================================
-- 3. pluggy_v2_sync_runs
-- =========================================================
CREATE TABLE IF NOT EXISTS public.pluggy_v2_sync_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  connection_id UUID NOT NULL REFERENCES public.pluggy_v2_connections(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  triggered_by TEXT NOT NULL DEFAULT 'webhook' CHECK (triggered_by IN ('webhook','manual','cron','initial','reconnect','backfill')),
  source_webhook_event_id UUID,
  status public.pluggy_v2_sync_status NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  pages_processed INTEGER NOT NULL DEFAULT 0,
  transactions_ingested INTEGER NOT NULL DEFAULT 0,
  accounts_synced INTEGER NOT NULL DEFAULT 0,
  cursor_after TEXT,
  from_date DATE,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_webhook_event_id)
);

CREATE INDEX IF NOT EXISTS idx_pv2_run_company ON public.pluggy_v2_sync_runs(company_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_pv2_run_connection ON public.pluggy_v2_sync_runs(connection_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_pv2_run_status ON public.pluggy_v2_sync_runs(status) WHERE status IN ('running','pending','error');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pluggy_v2_sync_runs TO authenticated;
GRANT ALL ON public.pluggy_v2_sync_runs TO service_role;
ALTER TABLE public.pluggy_v2_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pv2_run_company_all"
  ON public.pluggy_v2_sync_runs FOR ALL TO authenticated
  USING (company_id IN (
    SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()
    UNION
    SELECT c.id FROM public.companies c WHERE c.user_id = auth.uid()
  ))
  WITH CHECK (company_id IN (
    SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()
    UNION
    SELECT c.id FROM public.companies c WHERE c.user_id = auth.uid()
  ));

CREATE POLICY "pv2_run_service_role_all"
  ON public.pluggy_v2_sync_runs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =========================================================
-- 4. pluggy_v2_transactions_raw (retenção imutável)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.pluggy_v2_transactions_raw (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.pluggy_v2_accounts(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES public.pluggy_v2_connections(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  pluggy_transaction_id TEXT NOT NULL,
  pluggy_account_id TEXT NOT NULL,
  provider_id TEXT,
  amount NUMERIC(18,2) NOT NULL,
  currency_code TEXT NOT NULL DEFAULT 'BRL',
  description TEXT,
  description_raw TEXT,
  category TEXT,
  category_id TEXT,
  type TEXT NOT NULL,
  status TEXT,
  date DATE NOT NULL,
  balance NUMERIC(18,2),
  merchant JSONB,
  payment_data JSONB,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  confirmed_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pluggy_transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_pv2_tx_company ON public.pluggy_v2_transactions_raw(company_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_pv2_tx_account ON public.pluggy_v2_transactions_raw(account_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_pv2_tx_provider ON public.pluggy_v2_transactions_raw(pluggy_account_id, provider_id) WHERE provider_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pv2_tx_confirmed ON public.pluggy_v2_transactions_raw(confirmed_transaction_id) WHERE confirmed_transaction_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pluggy_v2_transactions_raw TO authenticated;
GRANT ALL ON public.pluggy_v2_transactions_raw TO service_role;
ALTER TABLE public.pluggy_v2_transactions_raw ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pv2_tx_company_all"
  ON public.pluggy_v2_transactions_raw FOR ALL TO authenticated
  USING (company_id IN (
    SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()
    UNION
    SELECT c.id FROM public.companies c WHERE c.user_id = auth.uid()
  ))
  WITH CHECK (company_id IN (
    SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()
    UNION
    SELECT c.id FROM public.companies c WHERE c.user_id = auth.uid()
  ));

CREATE POLICY "pv2_tx_service_role_all"
  ON public.pluggy_v2_transactions_raw FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =========================================================
-- 5. pluggy_v2_transactions_raw_archive (arquivo frio)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.pluggy_v2_transactions_raw_archive (
  id UUID NOT NULL PRIMARY KEY,
  account_id UUID NOT NULL,
  connection_id UUID NOT NULL,
  company_id UUID NOT NULL,
  pluggy_transaction_id TEXT NOT NULL,
  pluggy_account_id TEXT NOT NULL,
  provider_id TEXT,
  amount NUMERIC(18,2) NOT NULL,
  currency_code TEXT NOT NULL DEFAULT 'BRL',
  description TEXT,
  description_raw TEXT,
  category TEXT,
  category_id TEXT,
  type TEXT NOT NULL,
  status TEXT,
  date DATE NOT NULL,
  balance NUMERIC(18,2),
  merchant JSONB,
  payment_data JSONB,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  confirmed_transaction_id UUID,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_pv2_tx_arch_company ON public.pluggy_v2_transactions_raw_archive(company_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_pv2_tx_arch_pluggy_tx ON public.pluggy_v2_transactions_raw_archive(pluggy_transaction_id);

GRANT SELECT, INSERT, DELETE ON public.pluggy_v2_transactions_raw_archive TO authenticated;
GRANT ALL ON public.pluggy_v2_transactions_raw_archive TO service_role;
ALTER TABLE public.pluggy_v2_transactions_raw_archive ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pv2_tx_arch_company_select"
  ON public.pluggy_v2_transactions_raw_archive FOR SELECT TO authenticated
  USING (company_id IN (
    SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()
    UNION
    SELECT c.id FROM public.companies c WHERE c.user_id = auth.uid()
  ));

CREATE POLICY "pv2_tx_arch_service_role_all"
  ON public.pluggy_v2_transactions_raw_archive FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =========================================================
-- 6. Colunas de rastreio em transactions
-- =========================================================
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS pluggy_staging_transaction_id UUID REFERENCES public.pluggy_staging_transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pluggy_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS pluggy_raw_snapshot JSONB;

CREATE INDEX IF NOT EXISTS idx_transactions_pluggy_staging ON public.transactions(pluggy_staging_transaction_id);
CREATE INDEX IF NOT EXISTS idx_transactions_pluggy_tx ON public.transactions(pluggy_transaction_id);

-- =========================================================
-- 7. Trigger de auditoria em exclusão de raw
-- =========================================================
CREATE OR REPLACE FUNCTION public.audit_pluggy_v2_raw_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.insert_audit_log(
    _action := 'pluggy_v2_raw_deleted',
    _entity_type := 'pluggy_v2_transactions_raw',
    _entity_id := OLD.id::text,
    _details := jsonb_build_object(
      'company_id', OLD.company_id,
      'pluggy_transaction_id', OLD.pluggy_transaction_id,
      'pluggy_account_id', OLD.pluggy_account_id,
      'amount', OLD.amount,
      'date', OLD.date,
      'deleted_by', auth.uid()
    )
  );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_pluggy_v2_raw_delete ON public.pluggy_v2_transactions_raw;
CREATE TRIGGER trg_audit_pluggy_v2_raw_delete
  BEFORE DELETE ON public.pluggy_v2_transactions_raw
  FOR EACH ROW EXECUTE FUNCTION public.audit_pluggy_v2_raw_delete();

-- =========================================================
-- 8. Atualizar pluggy_confirm_staging para copiar raw
-- =========================================================
CREATE OR REPLACE FUNCTION public.pluggy_confirm_staging(
  p_staging_ids uuid[],
  p_account_id uuid,
  p_category_id uuid DEFAULT NULL::uuid,
  p_payment_method_id uuid DEFAULT NULL::uuid,
  p_contact_id uuid DEFAULT NULL::uuid
)
 RETURNS TABLE(staging_id uuid, transaction_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user UUID := auth.uid();
  v_row RECORD;
  v_tx_id UUID;
  v_tx_type public.transaction_type;
  v_amount NUMERIC(18,2);
  v_company UUID;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT a.company_id INTO v_company FROM public.accounts a WHERE a.id = p_account_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'account_not_found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.company_members WHERE company_id = v_company AND user_id = v_user) THEN
    RAISE EXCEPTION 'account_forbidden';
  END IF;

  IF p_payment_method_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.payment_method_companies pmc
    WHERE pmc.payment_method_id = p_payment_method_id AND pmc.company_id = v_company
  ) THEN
    RAISE EXCEPTION 'payment_method_forbidden';
  END IF;

  IF p_contact_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contact_companies cc
    WHERE cc.contact_id = p_contact_id AND cc.company_id = v_company
  ) THEN
    RAISE EXCEPTION 'contact_forbidden';
  END IF;

  FOR v_row IN
    SELECT * FROM public.pluggy_staging_transactions
    WHERE id = ANY(p_staging_ids)
      AND status = 'pending'
      AND company_id = v_company
  LOOP
    v_amount := ABS(v_row.amount);
    v_tx_type := CASE WHEN v_row.amount >= 0 THEN 'entrada'::public.transaction_type
                      ELSE 'saida'::public.transaction_type END;

    INSERT INTO public.transactions (
      user_id, company_id, context, account_id, category_id,
      payment_method_id, contact_id,
      transaction_type, amount, amount_paid, description,
      transaction_date, payment_date, due_date, status,
      pluggy_staging_transaction_id, pluggy_transaction_id, pluggy_raw_snapshot,
      counterparty_name, counterparty_cnpj
    ) VALUES (
      v_user, v_row.company_id, 'pj', p_account_id, p_category_id,
      p_payment_method_id, p_contact_id,
      v_tx_type, v_amount, v_amount, COALESCE(v_row.description, 'Open Finance'),
      v_row.date, v_row.date, v_row.date,
      'confirmado'::public.transaction_status,
      v_row.id, v_row.pluggy_transaction_id, v_row.raw,
      v_row.counterparty_name, v_row.counterparty_document
    )
    RETURNING id INTO v_tx_id;

    UPDATE public.pluggy_staging_transactions
    SET status = 'confirmed', matched_transaction_id = v_tx_id, updated_at = now()
    WHERE id = v_row.id;

    -- Vincula o raw persistente V2, se existir
    UPDATE public.pluggy_v2_transactions_raw
    SET confirmed_transaction_id = v_tx_id, updated_at = now()
    WHERE pluggy_transaction_id = v_row.pluggy_transaction_id
      AND company_id = v_row.company_id;

    staging_id := v_row.id;
    transaction_id := v_tx_id;
    RETURN NEXT;
  END LOOP;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.pluggy_confirm_staging(UUID[], UUID, UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pluggy_confirm_staging(UUID[], UUID, UUID, UUID, UUID) TO service_role;

-- =========================================================
-- 9. Atualizar pluggy_confirm_staging_transfer para copiar raw
-- =========================================================
CREATE OR REPLACE FUNCTION public.pluggy_confirm_staging_transfer(
  p_staging_ids uuid[],
  p_origin_account_id uuid,
  p_destination_account_id uuid,
  p_category_id uuid DEFAULT NULL::uuid,
  p_payment_method_id uuid DEFAULT NULL::uuid,
  p_contact_id uuid DEFAULT NULL::uuid
)
 RETURNS TABLE(staging_id uuid, transaction_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user UUID := auth.uid();
  v_row RECORD;
  v_tx_id UUID;
  v_amount NUMERIC(18,2);
  v_company UUID;
  v_dest_company UUID;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT a.company_id INTO v_company FROM public.accounts a WHERE a.id = p_origin_account_id;
  SELECT a.company_id INTO v_dest_company FROM public.accounts a WHERE a.id = p_destination_account_id;

  IF v_company IS NULL OR v_dest_company IS NULL THEN
    RAISE EXCEPTION 'account_not_found';
  END IF;
  IF v_company <> v_dest_company THEN
    RAISE EXCEPTION 'accounts_must_belong_to_same_company';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.company_members WHERE company_id = v_company AND user_id = v_user) THEN
    RAISE EXCEPTION 'account_forbidden';
  END IF;

  IF p_payment_method_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.payment_method_companies pmc
    WHERE pmc.payment_method_id = p_payment_method_id AND pmc.company_id = v_company
  ) THEN
    RAISE EXCEPTION 'payment_method_forbidden';
  END IF;

  IF p_contact_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contact_companies cc
    WHERE cc.contact_id = p_contact_id AND cc.company_id = v_company
  ) THEN
    RAISE EXCEPTION 'contact_forbidden';
  END IF;

  FOR v_row IN
    SELECT * FROM public.pluggy_staging_transactions
    WHERE id = ANY(p_staging_ids)
      AND status = 'pending'
      AND company_id = v_company
  LOOP
    v_amount := ABS(v_row.amount);

    INSERT INTO public.transactions (
      user_id, company_id, context, account_id, destination_account_id, category_id,
      payment_method_id, contact_id,
      transaction_type, amount, amount_paid, description,
      transaction_date, payment_date, due_date, status,
      pluggy_staging_transaction_id, pluggy_transaction_id, pluggy_raw_snapshot,
      counterparty_name, counterparty_cnpj
    ) VALUES (
      v_user, v_row.company_id, 'pj', p_origin_account_id, p_destination_account_id, p_category_id,
      p_payment_method_id, p_contact_id,
      'transferencia'::public.transaction_type, v_amount, v_amount, COALESCE(v_row.description, 'Open Finance'),
      v_row.date, v_row.date, v_row.date,
      'confirmado'::public.transaction_status,
      v_row.id, v_row.pluggy_transaction_id, v_row.raw,
      v_row.counterparty_name, v_row.counterparty_document
    )
    RETURNING id INTO v_tx_id;

    UPDATE public.pluggy_staging_transactions
    SET status = 'confirmed', matched_transaction_id = v_tx_id, updated_at = now()
    WHERE id = v_row.id;

    UPDATE public.pluggy_v2_transactions_raw
    SET confirmed_transaction_id = v_tx_id, updated_at = now()
    WHERE pluggy_transaction_id = v_row.pluggy_transaction_id
      AND company_id = v_row.company_id;

    staging_id := v_row.id;
    transaction_id := v_tx_id;
    RETURN NEXT;
  END LOOP;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.pluggy_confirm_staging_transfer(UUID[], UUID, UUID, UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pluggy_confirm_staging_transfer(UUID[], UUID, UUID, UUID, UUID, UUID) TO service_role;

-- =========================================================
-- 10. updated_at triggers
-- =========================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'pluggy_v2_connections',
      'pluggy_v2_accounts',
      'pluggy_v2_sync_runs',
      'pluggy_v2_transactions_raw'
    ])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%s', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON public.%s FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t, t);
  END LOOP;
END;
$$;
