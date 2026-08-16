-- 1. Novos planos
UPDATE public.plans SET is_active = false, is_public = false
WHERE slug IN ('free','starter','pro','business');

INSERT INTO public.plans (slug, name, description, price_cents, billing_period, trial_days, is_active, is_public, sort_order, is_featured, featured_label, features)
VALUES
('essencial', '360° Food Essencial', 'Pequenos estabelecimentos que precisam do financeiro sob controle.', 14990, 'monthly', 0, true, true, 1, false, 'Mais popular',
 jsonb_build_object(
   'solution','financeiro','profile','Pequenos estabelecimentos',
   'max_companies',1,'included_companies',1,'price_per_extra_company_cents',0,
   'max_users_per_company',2,'max_accountant_seats',1,'max_open_finance_connections',2,
   'max_transactions_per_month',-1,'max_attachments_per_transaction',5,
   'whatsapp_alerts_per_month',50,'ai_enabled',true,'reports_advanced',true,
   'export_pdf',true,'export_csv',true,'accounting_export',true,'support','email',
   'loyalty_enabled',true,'loyalty_installments',9,'annual_total_cents',134910,'annual_savings_cents',44970
 )),
('gestao', '360° Food Gestão', 'Bares e restaurantes em crescimento, com equipe e rotina financeira diária.', 29990, 'monthly', 0, true, true, 2, true, 'Mais popular',
 jsonb_build_object(
   'solution','financeiro','profile','Bares e restaurantes em crescimento',
   'max_companies',1,'included_companies',1,'price_per_extra_company_cents',0,
   'max_users_per_company',5,'max_accountant_seats',1,'max_open_finance_connections',5,
   'max_transactions_per_month',-1,'max_attachments_per_transaction',10,
   'whatsapp_alerts_per_month',50,'ai_enabled',true,'reports_advanced',true,
   'export_pdf',true,'export_csv',true,'accounting_export',true,'support','priority',
   'loyalty_enabled',true,'loyalty_installments',9,'annual_total_cents',269910,'annual_savings_cents',89970
 )),
('multiempresa', '360° Food Multiempresa', 'Redes e grupos gastronômicos com várias unidades e CNPJs.', 54990, 'monthly', 0, true, true, 3, false, 'Mais popular',
 jsonb_build_object(
   'solution','financeiro','profile','Redes e grupos gastronômicos',
   'max_companies',3,'included_companies',3,'price_per_extra_company_cents',0,
   'max_users_per_company',15,'max_accountant_seats',3,'max_open_finance_connections',12,
   'max_transactions_per_month',-1,'max_attachments_per_transaction',15,
   'whatsapp_alerts_per_month',50,'ai_enabled',true,'reports_advanced',true,
   'export_pdf',true,'export_csv',true,'accounting_export',true,'support','dedicated',
   'loyalty_enabled',true,'loyalty_installments',9,'annual_total_cents',494910,'annual_savings_cents',164970
 ))
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  is_active = true, is_public = true, sort_order = EXCLUDED.sort_order,
  is_featured = EXCLUDED.is_featured, features = EXCLUDED.features;

-- 2. Ciclo Fidelidade 360 na assinatura
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS billing_variant text NOT NULL DEFAULT 'monthly_flex',
  ADD COLUMN IF NOT EXISTS cycle_month integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS paid_months_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_charge_date date,
  ADD COLUMN IF NOT EXISTS next_free_month integer,
  ADD COLUMN IF NOT EXISTS last_payment_status text,
  ADD COLUMN IF NOT EXISTS monthly_price_cents integer,
  ADD COLUMN IF NOT EXISTS card_brand text,
  ADD COLUMN IF NOT EXISTS card_last4 text,
  ADD COLUMN IF NOT EXISTS dunning_stage integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loyalty_started_at timestamptz;

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_billing_variant_check;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_billing_variant_check
  CHECK (billing_variant IN ('monthly_flex','fidelidade360'));

-- 3. Token do cartão isolado do cliente
CREATE TABLE IF NOT EXISTS public.subscription_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  gateway text NOT NULL DEFAULT 'asaas',
  customer_gateway_id text,
  card_token text NOT NULL,
  card_brand text,
  card_last4 text,
  expires_month integer,
  expires_year integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS subscription_cards_subscription_key
  ON public.subscription_cards(subscription_id);

GRANT ALL ON public.subscription_cards TO service_role;
ALTER TABLE public.subscription_cards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Super admins manage subscription cards" ON public.subscription_cards;
CREATE POLICY "Super admins manage subscription cards"
  ON public.subscription_cards FOR ALL TO authenticated
  USING (public.is_super_admin((SELECT auth.uid())))
  WITH CHECK (public.is_super_admin((SELECT auth.uid())));

-- 4. Histórico do ciclo
CREATE TABLE IF NOT EXISTS public.subscription_cycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  cycle_month integer NOT NULL,
  kind text NOT NULL,
  amount_cents integer NOT NULL DEFAULT 0,
  discount_cents integer NOT NULL DEFAULT 0,
  due_date date,
  external_charge_id text,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.subscription_cycle_events
  DROP CONSTRAINT IF EXISTS subscription_cycle_events_kind_check;
ALTER TABLE public.subscription_cycle_events
  ADD CONSTRAINT subscription_cycle_events_kind_check
  CHECK (kind IN ('charged','free_courtesy','free_benefit','paid','declined','overdue','refunded','chargeback','card_expired','suspended','reactivated','canceled'));

CREATE INDEX IF NOT EXISTS subscription_cycle_events_sub_idx
  ON public.subscription_cycle_events(subscription_id, cycle_month);

GRANT SELECT ON public.subscription_cycle_events TO authenticated;
GRANT ALL ON public.subscription_cycle_events TO service_role;
ALTER TABLE public.subscription_cycle_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own cycle events" ON public.subscription_cycle_events;
CREATE POLICY "Users view own cycle events"
  ON public.subscription_cycle_events FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "Super admins manage cycle events" ON public.subscription_cycle_events;
CREATE POLICY "Super admins manage cycle events"
  ON public.subscription_cycle_events FOR ALL TO authenticated
  USING (public.is_super_admin((SELECT auth.uid())))
  WITH CHECK (public.is_super_admin((SELECT auth.uid())));

-- 5. Calendário Fidelidade 360
CREATE OR REPLACE FUNCTION public.fidelidade360_is_free_month(_cycle_month integer, _paid_months integer)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _cycle_month = 1 THEN true
    WHEN _cycle_month = 5 THEN _paid_months >= 3
    WHEN _cycle_month = 9 THEN _paid_months >= 6
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.fidelidade360_next_free_month(_cycle_month integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _cycle_month < 5 THEN 5
    WHEN _cycle_month < 9 THEN 9
    ELSE NULL
  END;
$$;