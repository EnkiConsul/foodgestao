-- Fase 1: Gestão de Cartão de Crédito — schema base

-- 1. Enum de status de fatura
DO $$ BEGIN
  CREATE TYPE public.invoice_cycle_status AS ENUM (
    'aberta','fechada','paga','parcial','atrasada'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. credit_cards: atributos próprios do cartão, 1:1 com accounts
CREATE TABLE IF NOT EXISTS public.credit_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL UNIQUE REFERENCES public.accounts(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  context public.context_type NOT NULL DEFAULT 'pj',

  brand text,
  last4 text CHECK (last4 IS NULL OR last4 ~ '^\d{4}$'),
  holder_name text,
  issuer text,

  credit_limit numeric(15,2) NOT NULL DEFAULT 0 CHECK (credit_limit >= 0),

  closing_day smallint NOT NULL CHECK (closing_day BETWEEN 1 AND 31),
  due_day     smallint NOT NULL CHECK (due_day BETWEEN 1 AND 31),

  default_payment_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  autopay boolean NOT NULL DEFAULT false,

  interest_rate_monthly numeric(6,4) NOT NULL DEFAULT 0 CHECK (interest_rate_monthly >= 0),
  minimum_payment_percent numeric(5,2) NOT NULL DEFAULT 15.00
    CHECK (minimum_payment_percent >= 0 AND minimum_payment_percent <= 100),

  is_corporate boolean NOT NULL DEFAULT true,
  employee_id uuid,
  cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  monthly_spend_policy numeric(15,2) CHECK (monthly_spend_policy IS NULL OR monthly_spend_policy >= 0),

  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_cards_company ON public.credit_cards(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_credit_cards_user ON public.credit_cards(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_cards TO authenticated;
GRANT ALL ON public.credit_cards TO service_role;

ALTER TABLE public.credit_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "credit_cards_select" ON public.credit_cards
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR (company_id IS NOT NULL AND private.is_company_member(auth.uid(), company_id))
  );

CREATE POLICY "credit_cards_insert" ON public.credit_cards
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (
      company_id IS NULL
      OR private.member_can_edit(auth.uid(), company_id, 'transactions')
    )
  );

CREATE POLICY "credit_cards_update" ON public.credit_cards
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    OR (company_id IS NOT NULL AND private.member_can_edit(auth.uid(), company_id, 'transactions'))
  )
  WITH CHECK (
    auth.uid() = user_id
    OR (company_id IS NOT NULL AND private.member_can_edit(auth.uid(), company_id, 'transactions'))
  );

CREATE POLICY "credit_cards_delete" ON public.credit_cards
  FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    OR (company_id IS NOT NULL AND private.member_can_edit(auth.uid(), company_id, 'transactions'))
  );

CREATE TRIGGER trg_credit_cards_updated_at
  BEFORE UPDATE ON public.credit_cards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. credit_card_invoices: a fatura em si
CREATE TABLE IF NOT EXISTS public.credit_card_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_card_id uuid NOT NULL REFERENCES public.credit_cards(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  reference_month date NOT NULL,
  period_start date NOT NULL,
  closing_date  date NOT NULL,
  due_date      date NOT NULL,

  status public.invoice_cycle_status NOT NULL DEFAULT 'aberta',

  total_purchases    numeric(15,2) NOT NULL DEFAULT 0,
  total_installments numeric(15,2) NOT NULL DEFAULT 0,
  total_interest     numeric(15,2) NOT NULL DEFAULT 0,
  total_fees         numeric(15,2) NOT NULL DEFAULT 0,
  total_credits      numeric(15,2) NOT NULL DEFAULT 0,
  previous_balance   numeric(15,2) NOT NULL DEFAULT 0,
  total_amount       numeric(15,2) NOT NULL DEFAULT 0,
  minimum_amount     numeric(15,2) NOT NULL DEFAULT 0,
  paid_amount        numeric(15,2) NOT NULL DEFAULT 0,

  payment_transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  closed_at timestamptz,
  paid_at   timestamptz,

  provider_invoice_id text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (credit_card_id, reference_month)
);

CREATE INDEX IF NOT EXISTS idx_cc_invoices_card_status
  ON public.credit_card_invoices(credit_card_id, status);
CREATE INDEX IF NOT EXISTS idx_cc_invoices_due
  ON public.credit_card_invoices(due_date)
  WHERE status IN ('fechada','parcial','atrasada');
CREATE UNIQUE INDEX IF NOT EXISTS uq_cc_invoices_provider
  ON public.credit_card_invoices(credit_card_id, provider_invoice_id)
  WHERE provider_invoice_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_card_invoices TO authenticated;
GRANT ALL ON public.credit_card_invoices TO service_role;

ALTER TABLE public.credit_card_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cc_invoices_select" ON public.credit_card_invoices
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR (company_id IS NOT NULL AND private.is_company_member(auth.uid(), company_id))
  );

CREATE POLICY "cc_invoices_insert" ON public.credit_card_invoices
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (
      company_id IS NULL
      OR private.member_can_edit(auth.uid(), company_id, 'transactions')
    )
  );

CREATE POLICY "cc_invoices_update" ON public.credit_card_invoices
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    OR (company_id IS NOT NULL AND private.member_can_edit(auth.uid(), company_id, 'transactions'))
  )
  WITH CHECK (
    auth.uid() = user_id
    OR (company_id IS NOT NULL AND private.member_can_edit(auth.uid(), company_id, 'transactions'))
  );

CREATE POLICY "cc_invoices_delete" ON public.credit_card_invoices
  FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    OR (company_id IS NOT NULL AND private.member_can_edit(auth.uid(), company_id, 'transactions'))
  );

CREATE TRIGGER trg_cc_invoices_updated_at
  BEFORE UPDATE ON public.credit_card_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Vínculo com lançamentos
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS credit_card_invoice_id uuid
    REFERENCES public.credit_card_invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_invoice_payment boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_transactions_cc_invoice
  ON public.transactions(credit_card_invoice_id)
  WHERE credit_card_invoice_id IS NOT NULL;

-- 5. Helper de resolução de data de ciclo (fev com dia 31 → 28/29 etc.)
CREATE OR REPLACE FUNCTION private.resolve_cycle_date(
  _year int, _month int, _day smallint
) RETURNS date
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT make_date(
    _year,
    _month,
    LEAST(
      _day::int,
      EXTRACT(DAY FROM (make_date(_year, _month, 1) + interval '1 month - 1 day'))::int
    )
  );
$$;

REVOKE ALL ON FUNCTION private.resolve_cycle_date(int, int, smallint) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.resolve_cycle_date(int, int, smallint) FROM anon;
GRANT EXECUTE ON FUNCTION private.resolve_cycle_date(int, int, smallint) TO authenticated, service_role;