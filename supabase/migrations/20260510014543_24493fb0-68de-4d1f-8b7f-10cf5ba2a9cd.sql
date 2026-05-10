-- ============================================================
-- BACKOFFICE: Plans, Subscriptions, Invoices, Coupons, Usage
-- ============================================================

-- Enums
CREATE TYPE public.billing_period AS ENUM ('monthly', 'yearly');
CREATE TYPE public.subscription_status AS ENUM ('trialing', 'active', 'past_due', 'canceled', 'expired', 'pending');
CREATE TYPE public.invoice_status AS ENUM ('draft', 'open', 'paid', 'overdue', 'canceled', 'refunded');
CREATE TYPE public.invoice_payment_method AS ENUM ('pix', 'boleto', 'card', 'manual');
CREATE TYPE public.discount_type AS ENUM ('percent', 'fixed');

-- ============================================================
-- PLANS
-- ============================================================
CREATE TABLE public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  price_cents integer NOT NULL DEFAULT 0,
  billing_period billing_period NOT NULL DEFAULT 'monthly',
  trial_days integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_public boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active public plans"
ON public.plans FOR SELECT
USING (is_active = true AND is_public = true);

CREATE POLICY "Super admins manage plans"
ON public.plans FOR ALL TO authenticated
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

CREATE TRIGGER update_plans_updated_at
BEFORE UPDATE ON public.plans
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- SUBSCRIPTIONS
-- ============================================================
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  plan_id uuid NOT NULL REFERENCES public.plans(id) ON DELETE RESTRICT,
  status subscription_status NOT NULL DEFAULT 'trialing',
  started_at timestamptz NOT NULL DEFAULT now(),
  current_period_start timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  canceled_at timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  external_subscription_id text,
  external_customer_id text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscriptions_user ON public.subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON public.subscriptions(status);
CREATE UNIQUE INDEX idx_subscriptions_one_active_per_user
  ON public.subscriptions(user_id)
  WHERE status IN ('trialing', 'active', 'past_due', 'pending');

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own subscription"
ON public.subscriptions FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Super admins manage subscriptions"
ON public.subscriptions FOR ALL TO authenticated
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

CREATE TRIGGER update_subscriptions_updated_at
BEFORE UPDATE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- INVOICES
-- ============================================================
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  amount_cents integer NOT NULL,
  discount_cents integer NOT NULL DEFAULT 0,
  status invoice_status NOT NULL DEFAULT 'open',
  due_date date NOT NULL,
  paid_at timestamptz,
  period_start date,
  period_end date,
  payment_method invoice_payment_method,
  external_invoice_id text,
  external_payment_url text,
  pix_qrcode text,
  boleto_url text,
  coupon_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoices_user ON public.invoices(user_id);
CREATE INDEX idx_invoices_subscription ON public.invoices(subscription_id);
CREATE INDEX idx_invoices_status ON public.invoices(status);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own invoices"
ON public.invoices FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Super admins manage invoices"
ON public.invoices FOR ALL TO authenticated
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

CREATE TRIGGER update_invoices_updated_at
BEFORE UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- COUPONS
-- ============================================================
CREATE TABLE public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  description text,
  discount_type discount_type NOT NULL,
  discount_value numeric NOT NULL CHECK (discount_value > 0),
  max_redemptions integer,
  times_redeemed integer NOT NULL DEFAULT 0,
  valid_from timestamptz,
  valid_until timestamptz,
  applies_to_plan_ids uuid[] DEFAULT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

-- Public can validate by code (read-only of active coupons)
CREATE POLICY "Anyone can read active coupons"
ON public.coupons FOR SELECT
USING (is_active = true);

CREATE POLICY "Super admins manage coupons"
ON public.coupons FOR ALL TO authenticated
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

CREATE TRIGGER update_coupons_updated_at
BEFORE UPDATE ON public.coupons
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- COUPON REDEMPTIONS
-- ============================================================
CREATE TABLE public.coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  redeemed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_redemptions_coupon ON public.coupon_redemptions(coupon_id);
CREATE INDEX idx_redemptions_user ON public.coupon_redemptions(user_id);

ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own redemptions"
ON public.coupon_redemptions FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Super admins manage redemptions"
ON public.coupon_redemptions FOR ALL TO authenticated
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

-- ============================================================
-- USAGE COUNTERS
-- ============================================================
CREATE TABLE public.usage_counters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  period_month date NOT NULL,
  transactions_created integer NOT NULL DEFAULT 0,
  companies_count integer NOT NULL DEFAULT 0,
  attachments_count integer NOT NULL DEFAULT 0,
  ai_requests integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, period_month)
);

CREATE INDEX idx_usage_user_period ON public.usage_counters(user_id, period_month);

ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own usage"
ON public.usage_counters FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users insert own usage"
ON public.usage_counters FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own usage"
ON public.usage_counters FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Super admins manage usage"
ON public.usage_counters FOR ALL TO authenticated
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

CREATE TRIGGER update_usage_counters_updated_at
BEFORE UPDATE ON public.usage_counters
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Get features of user's active plan
CREATE OR REPLACE FUNCTION public.get_user_plan_features(_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(p.features, '{}'::jsonb)
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  WHERE s.user_id = _user_id
    AND s.status IN ('trialing', 'active', 'past_due')
  ORDER BY s.created_at DESC
  LIMIT 1;
$$;

-- Auto-create trial subscription on signup
CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _plan_id uuid;
  _trial_days integer;
BEGIN
  SELECT id, trial_days INTO _plan_id, _trial_days
  FROM public.plans
  WHERE slug = 'free' AND is_active = true
  LIMIT 1;

  IF _plan_id IS NOT NULL THEN
    INSERT INTO public.subscriptions (
      user_id, plan_id, status, trial_ends_at, current_period_end
    ) VALUES (
      NEW.id,
      _plan_id,
      CASE WHEN _trial_days > 0 THEN 'trialing'::subscription_status ELSE 'active'::subscription_status END,
      CASE WHEN _trial_days > 0 THEN now() + (_trial_days || ' days')::interval ELSE NULL END,
      now() + interval '1 month'
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_subscription
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_subscription();

-- ============================================================
-- SEED DEFAULT PLANS
-- ============================================================
INSERT INTO public.plans (slug, name, description, price_cents, billing_period, trial_days, sort_order, features) VALUES
('free', 'Free', 'Para começar a organizar suas finanças', 0, 'monthly', 0, 1, '{
  "max_companies": 1,
  "max_transactions_per_month": 50,
  "max_users_per_company": 1,
  "max_attachments_per_transaction": 1,
  "ai_enabled": false,
  "reports_advanced": false,
  "export_pdf": false,
  "export_csv": true,
  "support": "community"
}'::jsonb),
('starter', 'Starter', 'Ideal para autônomos e MEIs', 2990, 'monthly', 14, 2, '{
  "max_companies": 3,
  "max_transactions_per_month": 500,
  "max_users_per_company": 2,
  "max_attachments_per_transaction": 3,
  "ai_enabled": false,
  "reports_advanced": false,
  "export_pdf": true,
  "export_csv": true,
  "support": "email"
}'::jsonb),
('pro', 'Pro', 'Para profissionais e pequenas empresas', 5990, 'monthly', 14, 3, '{
  "max_companies": 10,
  "max_transactions_per_month": -1,
  "max_users_per_company": 5,
  "max_attachments_per_transaction": 5,
  "ai_enabled": true,
  "reports_advanced": true,
  "export_pdf": true,
  "export_csv": true,
  "support": "priority"
}'::jsonb),
('business', 'Business', 'Para empresas em crescimento', 14990, 'monthly', 14, 4, '{
  "max_companies": -1,
  "max_transactions_per_month": -1,
  "max_users_per_company": -1,
  "max_attachments_per_transaction": 10,
  "ai_enabled": true,
  "reports_advanced": true,
  "export_pdf": true,
  "export_csv": true,
  "support": "dedicated"
}'::jsonb);

-- Backfill: create free subscription for existing users without one
INSERT INTO public.subscriptions (user_id, plan_id, status, current_period_end)
SELECT u.id, p.id, 'active', now() + interval '1 month'
FROM auth.users u
CROSS JOIN public.plans p
WHERE p.slug = 'free'
  AND NOT EXISTS (
    SELECT 1 FROM public.subscriptions s WHERE s.user_id = u.id
  );