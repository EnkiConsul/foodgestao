ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS subscriptions_company_idx ON public.subscriptions(company_id);

UPDATE public.subscriptions s SET company_id = c.id
FROM (SELECT DISTINCT ON (user_id) id, user_id FROM public.companies ORDER BY user_id, created_at) c
WHERE c.user_id = s.user_id AND s.company_id IS NULL;

ALTER TABLE public.subscription_addons
  ADD COLUMN IF NOT EXISTS price_cents integer NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  ADD COLUMN IF NOT EXISTS is_exempt boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','canceled')),
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS canceled_at timestamptz;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscription_addons TO authenticated;
GRANT ALL ON public.subscription_addons TO service_role;
ALTER TABLE public.subscription_addons ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.subscription_addons_touch() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); IF NEW.status = 'canceled' AND OLD.status <> 'canceled' THEN NEW.canceled_at = now(); END IF; RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS subscription_addons_touch ON public.subscription_addons;
CREATE TRIGGER subscription_addons_touch BEFORE UPDATE ON public.subscription_addons FOR EACH ROW EXECUTE FUNCTION public.subscription_addons_touch();

CREATE OR REPLACE FUNCTION public.subscription_capacity(_subscription_id uuid)
RETURNS TABLE(addon_code text, addon_name text, extra_quantity integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.code, a.name, COALESCE(SUM(sa.quantity),0)::int
  FROM public.subscription_addons sa
  JOIN public.plan_addons a ON a.id = sa.addon_id
  JOIN public.subscriptions s ON s.id = sa.subscription_id
  WHERE sa.subscription_id = _subscription_id AND sa.status = 'active'
    AND (s.user_id = auth.uid() OR public.is_super_admin(auth.uid()) OR auth.role() = 'service_role')
  GROUP BY a.code, a.name;
$$;
REVOKE ALL ON FUNCTION public.subscription_capacity(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.subscription_capacity(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.subscriptions_default_company() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    SELECT id INTO NEW.company_id FROM public.companies WHERE user_id = NEW.user_id ORDER BY created_at LIMIT 1;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS subscriptions_default_company ON public.subscriptions;
CREATE TRIGGER subscriptions_default_company BEFORE INSERT ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.subscriptions_default_company();

CREATE OR REPLACE FUNCTION public.companies_link_subscription() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.subscriptions SET company_id = NEW.id WHERE user_id = NEW.user_id AND company_id IS NULL;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS companies_link_subscription ON public.companies;
CREATE TRIGGER companies_link_subscription AFTER INSERT ON public.companies FOR EACH ROW EXECUTE FUNCTION public.companies_link_subscription();