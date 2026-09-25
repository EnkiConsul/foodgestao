ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS module text NOT NULL DEFAULT 'financeiro' CHECK (module IN ('financeiro','pessoas')),
  ADD COLUMN IF NOT EXISTS annual_discount_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (annual_discount_pct >= 0 AND annual_discount_pct <= 100),
  ADD COLUMN IF NOT EXISTS is_enterprise boolean NOT NULL DEFAULT false;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS module text NOT NULL DEFAULT 'financeiro' CHECK (module IN ('financeiro','pessoas'));

DROP INDEX IF EXISTS public.idx_subscriptions_one_active_per_user;
CREATE UNIQUE INDEX idx_subscriptions_one_active_per_user_module ON public.subscriptions (user_id, module)
  WHERE status IN ('trialing','active','past_due','pending');

CREATE TABLE public.plan_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module text NOT NULL CHECK (module IN ('financeiro','pessoas')),
  code text NOT NULL,
  name text NOT NULL,
  description text,
  price_cents integer NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  allowed_plan_slugs text[],
  max_quantity integer CHECK (max_quantity IS NULL OR max_quantity >= 0),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (module, code)
);
GRANT SELECT ON public.plan_addons TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.plan_addons TO authenticated;
GRANT ALL ON public.plan_addons TO service_role;
ALTER TABLE public.plan_addons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plan_addons_read_active" ON public.plan_addons FOR SELECT TO authenticated
  USING (is_active OR public.is_super_admin((SELECT auth.uid())));
CREATE POLICY "plan_addons_admin_manage" ON public.plan_addons FOR ALL TO authenticated
  USING (public.is_super_admin((SELECT auth.uid()))) WITH CHECK (public.is_super_admin((SELECT auth.uid())));
CREATE TRIGGER update_plan_addons_updated_at BEFORE UPDATE ON public.plan_addons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.subscription_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  addon_id uuid NOT NULL REFERENCES public.plan_addons(id) ON DELETE RESTRICT,
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subscription_id, addon_id)
);
CREATE INDEX idx_subscription_addons_addon ON public.subscription_addons(addon_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscription_addons TO authenticated;
GRANT ALL ON public.subscription_addons TO service_role;
ALTER TABLE public.subscription_addons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subscription_addons_owner_read" ON public.subscription_addons FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.id = subscription_id AND s.user_id = (SELECT auth.uid())));
CREATE POLICY "subscription_addons_admin_manage" ON public.subscription_addons FOR ALL TO authenticated
  USING (public.is_super_admin((SELECT auth.uid()))) WITH CHECK (public.is_super_admin((SELECT auth.uid())));
CREATE TRIGGER update_subscription_addons_updated_at BEFORE UPDATE ON public.subscription_addons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();