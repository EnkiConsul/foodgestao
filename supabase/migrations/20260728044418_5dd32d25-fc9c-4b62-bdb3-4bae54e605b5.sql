
-- ============================================
-- PLUGGY OPEN FINANCE - Base tables
-- ============================================

-- Connection status enum
CREATE TYPE public.pluggy_connection_status AS ENUM (
  'created','updating','waiting_user_input','login_error','outdated','updated','error','deleted'
);

-- Staging transaction status enum
CREATE TYPE public.pluggy_staging_status AS ENUM (
  'pending','confirmed','ignored','duplicate'
);

-- ---------------------------------------
-- pluggy_connections
-- ---------------------------------------
CREATE TABLE public.pluggy_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  pluggy_item_id TEXT NOT NULL UNIQUE,
  connector_id INTEGER,
  connector_name TEXT,
  connector_image_url TEXT,
  status public.pluggy_connection_status NOT NULL DEFAULT 'created',
  execution_status TEXT,
  last_synced_at TIMESTAMPTZ,
  last_error JSONB,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pluggy_connections TO authenticated;
GRANT ALL ON public.pluggy_connections TO service_role;

ALTER TABLE public.pluggy_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pluggy_connections_member_read"
  ON public.pluggy_connections FOR SELECT
  TO authenticated
  USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "pluggy_connections_member_write"
  ON public.pluggy_connections FOR INSERT
  TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "pluggy_connections_member_update"
  ON public.pluggy_connections FOR UPDATE
  TO authenticated
  USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "pluggy_connections_member_delete"
  ON public.pluggy_connections FOR DELETE
  TO authenticated
  USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE INDEX idx_pluggy_connections_company ON public.pluggy_connections(company_id, status);

-- ---------------------------------------
-- pluggy_accounts
-- ---------------------------------------
CREATE TABLE public.pluggy_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES public.pluggy_connections(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  pluggy_account_id TEXT NOT NULL UNIQUE,
  type TEXT,
  subtype TEXT,
  name TEXT,
  number_masked TEXT,
  balance NUMERIC(18,2),
  currency_code TEXT DEFAULT 'BRL',
  linked_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pluggy_accounts TO authenticated;
GRANT ALL ON public.pluggy_accounts TO service_role;

ALTER TABLE public.pluggy_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pluggy_accounts_member_all"
  ON public.pluggy_accounts FOR ALL
  TO authenticated
  USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE INDEX idx_pluggy_accounts_connection ON public.pluggy_accounts(connection_id);
CREATE INDEX idx_pluggy_accounts_company ON public.pluggy_accounts(company_id);

-- ---------------------------------------
-- pluggy_staging_transactions
-- ---------------------------------------
CREATE TABLE public.pluggy_staging_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES public.pluggy_connections(id) ON DELETE CASCADE,
  pluggy_account_id TEXT NOT NULL,
  pluggy_transaction_id TEXT NOT NULL UNIQUE,
  date DATE NOT NULL,
  description TEXT,
  amount NUMERIC(18,2) NOT NULL,
  currency_code TEXT DEFAULT 'BRL',
  category_pluggy TEXT,
  type TEXT,
  raw JSONB,
  status public.pluggy_staging_status NOT NULL DEFAULT 'pending',
  matched_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  suggested_category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  suggested_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pluggy_staging_transactions TO authenticated;
GRANT ALL ON public.pluggy_staging_transactions TO service_role;

ALTER TABLE public.pluggy_staging_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pluggy_staging_member_all"
  ON public.pluggy_staging_transactions FOR ALL
  TO authenticated
  USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE INDEX idx_pluggy_staging_company_status ON public.pluggy_staging_transactions(company_id, status);
CREATE INDEX idx_pluggy_staging_connection_date ON public.pluggy_staging_transactions(connection_id, date DESC);

-- ---------------------------------------
-- pluggy_webhook_events (idempotency log)
-- ---------------------------------------
CREATE TABLE public.pluggy_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT UNIQUE,
  event_type TEXT NOT NULL,
  pluggy_item_id TEXT,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.pluggy_webhook_events TO service_role;

ALTER TABLE public.pluggy_webhook_events ENABLE ROW LEVEL SECURITY;

-- No authenticated access; only service_role via edge functions.
CREATE POLICY "pluggy_webhook_events_service_only"
  ON public.pluggy_webhook_events FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX idx_pluggy_webhook_item ON public.pluggy_webhook_events(pluggy_item_id);

-- ---------------------------------------
-- updated_at triggers
-- ---------------------------------------
CREATE TRIGGER trg_pluggy_connections_updated_at
  BEFORE UPDATE ON public.pluggy_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_pluggy_accounts_updated_at
  BEFORE UPDATE ON public.pluggy_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_pluggy_staging_updated_at
  BEFORE UPDATE ON public.pluggy_staging_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------
-- RPC: confirm staging rows -> transactions
-- ---------------------------------------
CREATE OR REPLACE FUNCTION public.pluggy_confirm_staging(
  p_staging_ids UUID[],
  p_account_id UUID,
  p_category_id UUID DEFAULT NULL
) RETURNS TABLE(staging_id UUID, transaction_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Validate account ownership through membership
  SELECT a.company_id INTO v_company FROM public.accounts a WHERE a.id = p_account_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'account_not_found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.company_members WHERE company_id = v_company AND user_id = v_user) THEN
    RAISE EXCEPTION 'account_forbidden';
  END IF;

  FOR v_row IN
    SELECT * FROM public.pluggy_staging_transactions
    WHERE id = ANY(p_staging_ids)
      AND status = 'pending'
      AND company_id = v_company
  LOOP
    v_amount := ABS(v_row.amount);
    v_tx_type := CASE WHEN v_row.amount >= 0 THEN 'receita'::public.transaction_type
                      ELSE 'despesa'::public.transaction_type END;

    INSERT INTO public.transactions (
      user_id, company_id, context, account_id, category_id,
      type, amount, description, transaction_date, payment_date, due_date,
      status
    ) VALUES (
      v_user, v_row.company_id, 'pj', p_account_id, p_category_id,
      v_tx_type, v_amount, COALESCE(v_row.description, 'Open Finance'),
      v_row.date, v_row.date, v_row.date,
      'confirmado'::public.transaction_status
    )
    RETURNING id INTO v_tx_id;

    UPDATE public.pluggy_staging_transactions
    SET status = 'confirmed', matched_transaction_id = v_tx_id, updated_at = now()
    WHERE id = v_row.id;

    staging_id := v_row.id;
    transaction_id := v_tx_id;
    RETURN NEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pluggy_confirm_staging(UUID[], UUID, UUID) TO authenticated;

-- Ignore RPC
CREATE OR REPLACE FUNCTION public.pluggy_ignore_staging(p_staging_ids UUID[])
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_count INTEGER;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  UPDATE public.pluggy_staging_transactions s
  SET status = 'ignored', updated_at = now()
  WHERE s.id = ANY(p_staging_ids)
    AND s.status = 'pending'
    AND s.company_id IN (SELECT company_id FROM public.company_members WHERE user_id = v_user);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pluggy_ignore_staging(UUID[]) TO authenticated;
