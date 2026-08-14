CREATE TABLE public.dp_menu_defaults (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  surface text NOT NULL CHECK (surface IN ('dp','portal')),
  layout jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, surface)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_menu_defaults TO authenticated;
GRANT ALL ON public.dp_menu_defaults TO service_role;

ALTER TABLE public.dp_menu_defaults ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dp_menu_defaults_member_read"
ON public.dp_menu_defaults FOR SELECT TO authenticated
USING (private.is_company_member((SELECT auth.uid()), company_id));

CREATE POLICY "dp_menu_defaults_admin_write"
ON public.dp_menu_defaults FOR ALL TO authenticated
USING (private.is_company_admin_or_owner((SELECT auth.uid()), company_id))
WITH CHECK (private.is_company_admin_or_owner((SELECT auth.uid()), company_id));

CREATE TRIGGER dp_menu_defaults_set_updated_at
BEFORE UPDATE ON public.dp_menu_defaults
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();