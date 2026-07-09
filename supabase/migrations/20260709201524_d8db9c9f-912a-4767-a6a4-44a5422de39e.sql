
CREATE TABLE public.chart_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  context public.context_type NOT NULL DEFAULT 'pf',
  code text NOT NULL,
  name text NOT NULL,
  description text,
  parent_id uuid REFERENCES public.chart_accounts(id) ON DELETE RESTRICT,
  allow_transactions boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  short_code text,
  is_tax boolean NOT NULL DEFAULT false,
  tax_code text,
  tax_description text,
  visible_pf boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX chart_accounts_user_idx ON public.chart_accounts(user_id);
CREATE INDEX chart_accounts_parent_idx ON public.chart_accounts(parent_id);
CREATE UNIQUE INDEX chart_accounts_user_code_uk ON public.chart_accounts(user_id, context, code);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chart_accounts TO authenticated;
GRANT ALL ON public.chart_accounts TO service_role;

ALTER TABLE public.chart_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chart_accounts_owner_all"
  ON public.chart_accounts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_chart_accounts_updated_at
  BEFORE UPDATE ON public.chart_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.chart_account_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chart_account_id uuid NOT NULL REFERENCES public.chart_accounts(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chart_account_id, company_id)
);

CREATE INDEX chart_account_companies_company_idx ON public.chart_account_companies(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chart_account_companies TO authenticated;
GRANT ALL ON public.chart_account_companies TO service_role;

ALTER TABLE public.chart_account_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chart_account_companies_owner_all"
  ON public.chart_account_companies FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.chart_accounts ca
    WHERE ca.id = chart_account_id AND ca.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.chart_accounts ca
    WHERE ca.id = chart_account_id AND ca.user_id = auth.uid()
  ));
