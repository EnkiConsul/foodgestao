
-- 1) bank_connections
CREATE TABLE public.bank_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  context context_type NOT NULL,
  provider text NOT NULL DEFAULT 'pluggy',
  provider_item_id text NOT NULL,
  institution_name text,
  institution_logo_url text,
  status text NOT NULL DEFAULT 'updating',
  consent_expires_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bank_connections_ctx_company_ck CHECK (
    (context = 'pf' AND company_id IS NULL) OR
    (context = 'pj' AND company_id IS NOT NULL)
  ),
  CONSTRAINT bank_connections_provider_item_uk UNIQUE (provider, provider_item_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_connections TO authenticated;
GRANT ALL ON public.bank_connections TO service_role;

ALTER TABLE public.bank_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bc_select"
  ON public.bank_connections FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (context = 'pj' AND company_id IS NOT NULL AND private.is_company_member(auth.uid(), company_id))
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "bc_insert"
  ON public.bank_connections FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      (context = 'pf' AND company_id IS NULL)
      OR (context = 'pj' AND company_id IS NOT NULL AND private.is_company_admin_or_owner(auth.uid(), company_id))
    )
  );

CREATE POLICY "bc_update"
  ON public.bank_connections FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR (context = 'pj' AND company_id IS NOT NULL AND private.is_company_admin_or_owner(auth.uid(), company_id))
  );

CREATE POLICY "bc_delete"
  ON public.bank_connections FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR (context = 'pj' AND company_id IS NOT NULL AND private.is_company_admin_or_owner(auth.uid(), company_id))
  );

CREATE TRIGGER trg_bank_connections_updated_at
  BEFORE UPDATE ON public.bank_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_bank_connections_user ON public.bank_connections(user_id);
CREATE INDEX idx_bank_connections_company ON public.bank_connections(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX idx_bank_connections_status ON public.bank_connections(status);

-- 2) bank_connection_accounts
CREATE TABLE public.bank_connection_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.bank_connections(id) ON DELETE CASCADE,
  provider_account_id text NOT NULL,
  provider_type text,
  provider_subtype text,
  provider_name text,
  provider_number text,
  currency_code text DEFAULT 'BRL',
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  auto_import boolean NOT NULL DEFAULT true,
  provider_balance numeric(15,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bca_provider_uk UNIQUE (connection_id, provider_account_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_connection_accounts TO authenticated;
GRANT ALL ON public.bank_connection_accounts TO service_role;

ALTER TABLE public.bank_connection_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bca_select"
  ON public.bank_connection_accounts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bank_connections c
      WHERE c.id = bank_connection_accounts.connection_id
        AND (
          c.user_id = auth.uid()
          OR (c.context = 'pj' AND c.company_id IS NOT NULL AND private.is_company_member(auth.uid(), c.company_id))
          OR public.is_super_admin(auth.uid())
        )
    )
  );

CREATE POLICY "bca_write"
  ON public.bank_connection_accounts FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bank_connections c
      WHERE c.id = bank_connection_accounts.connection_id
        AND (
          c.user_id = auth.uid()
          OR (c.context = 'pj' AND c.company_id IS NOT NULL AND private.is_company_admin_or_owner(auth.uid(), c.company_id))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.bank_connections c
      WHERE c.id = bank_connection_accounts.connection_id
        AND (
          c.user_id = auth.uid()
          OR (c.context = 'pj' AND c.company_id IS NOT NULL AND private.is_company_admin_or_owner(auth.uid(), c.company_id))
        )
    )
  );

CREATE TRIGGER trg_bca_updated_at
  BEFORE UPDATE ON public.bank_connection_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_bca_connection ON public.bank_connection_accounts(connection_id);
CREATE INDEX idx_bca_account ON public.bank_connection_accounts(account_id) WHERE account_id IS NOT NULL;

-- 3) transactions: campos de import automático
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS connection_id uuid REFERENCES public.bank_connections(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_provider_external
  ON public.transactions(provider, external_id)
  WHERE provider IS NOT NULL AND external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_connection
  ON public.transactions(connection_id) WHERE connection_id IS NOT NULL;

-- 4) RPC para o cron chamar sem auth de usuário (usa service role)
CREATE OR REPLACE FUNCTION public.list_active_bank_connections()
RETURNS SETOF public.bank_connections
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.bank_connections
  WHERE status IN ('active','updating','outdated');
$$;

REVOKE ALL ON FUNCTION public.list_active_bank_connections() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_active_bank_connections() TO service_role;
