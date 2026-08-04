CREATE TABLE public.payment_method_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  visible_pf boolean NOT NULL DEFAULT true,
  visible_pj boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX payment_method_templates_name_key ON public.payment_method_templates (lower(name));

GRANT SELECT ON public.payment_method_templates TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.payment_method_templates TO authenticated;
GRANT ALL ON public.payment_method_templates TO service_role;

ALTER TABLE public.payment_method_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pm_templates_read" ON public.payment_method_templates
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "pm_templates_admin_write" ON public.payment_method_templates
  FOR ALL TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'super_admin'))
  WITH CHECK (public.has_role((SELECT auth.uid()), 'super_admin'));

CREATE TRIGGER update_payment_method_templates_updated_at
  BEFORE UPDATE ON public.payment_method_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Core seeding helper
CREATE OR REPLACE FUNCTION public.seed_default_payment_methods(_user_id uuid, _company_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tpl record;
  _pm_id uuid;
  _count integer := 0;
BEGIN
  FOR _tpl IN
    SELECT * FROM public.payment_method_templates
     WHERE is_active = true
       AND ((_company_id IS NULL AND visible_pf) OR (_company_id IS NOT NULL AND visible_pj))
     ORDER BY sort_order, name
  LOOP
    SELECT pm.id INTO _pm_id
      FROM public.payment_methods pm
     WHERE pm.user_id = _user_id AND lower(pm.name) = lower(_tpl.name)
     LIMIT 1;

    IF _pm_id IS NULL THEN
      INSERT INTO public.payment_methods (user_id, name, is_active, visible_pf)
      VALUES (_user_id, _tpl.name, true, _company_id IS NULL AND _tpl.visible_pf)
      RETURNING id INTO _pm_id;
      _count := _count + 1;
    END IF;

    IF _company_id IS NOT NULL THEN
      INSERT INTO public.payment_method_companies (payment_method_id, company_id)
      VALUES (_pm_id, _company_id)
      ON CONFLICT DO NOTHING;
    ELSIF NOT (SELECT visible_pf FROM public.payment_methods WHERE id = _pm_id) THEN
      UPDATE public.payment_methods SET visible_pf = true WHERE id = _pm_id;
    END IF;
  END LOOP;

  RETURN _count;
END;
$$;

-- Trigger: new company
CREATE OR REPLACE FUNCTION public.seed_default_payment_methods_on_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM public.seed_default_payment_methods(NEW.user_id, NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'seed_default_payment_methods_on_company failed for company %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

CREATE TRIGGER companies_seed_default_payment_methods
  AFTER INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.seed_default_payment_methods_on_company();

-- Trigger: new profile (PF)
CREATE OR REPLACE FUNCTION public.seed_default_payment_methods_on_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM public.seed_default_payment_methods(NEW.id, NULL);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'seed_default_payment_methods_on_profile failed for user %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_seed_default_payment_methods
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.seed_default_payment_methods_on_profile();

-- User-facing RPC
CREATE OR REPLACE FUNCTION public.apply_default_payment_methods(_context text, _company_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF _context = 'pj' THEN
    IF _company_id IS NULL THEN
      RAISE EXCEPTION 'company_id required' USING ERRCODE = '22023';
    END IF;
    IF NOT private.is_company_member(_uid, _company_id) THEN
      RAISE EXCEPTION 'Not a member of this company' USING ERRCODE = '42501';
    END IF;
    RETURN public.seed_default_payment_methods(_uid, _company_id);
  END IF;

  RETURN public.seed_default_payment_methods(_uid, NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.seed_default_payment_methods(uuid, uuid) FROM authenticated, anon;
GRANT EXECUTE ON FUNCTION public.apply_default_payment_methods(text, uuid) TO authenticated;

INSERT INTO public.payment_method_templates (name, sort_order, visible_pf, visible_pj) VALUES
  ('Dinheiro', 10, true, true),
  ('PIX', 20, true, true),
  ('Cartão de Débito', 30, true, true),
  ('Cartão de Crédito', 40, true, true),
  ('Boleto', 50, true, true),
  ('Transferência / TED', 60, true, true),
  ('Vale Alimentação / Refeição', 70, false, true),
  ('iFood', 80, false, true),
  ('Cheque', 90, false, true);