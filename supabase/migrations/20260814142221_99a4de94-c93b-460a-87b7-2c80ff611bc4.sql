ALTER TYPE public.app_module ADD VALUE IF NOT EXISTS 'ponto';
ALTER TYPE public.app_module ADD VALUE IF NOT EXISTS 'escala';
ALTER TYPE public.app_module ADD VALUE IF NOT EXISTS 'folha';

CREATE TABLE IF NOT EXISTS public.module_dependencies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  module public.app_module NOT NULL,
  requires public.app_module NOT NULL,
  hard boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT module_dependencies_unique UNIQUE (module, requires),
  CONSTRAINT module_dependencies_no_self CHECK (module <> requires)
);

GRANT SELECT ON public.module_dependencies TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.module_dependencies TO authenticated;
GRANT ALL ON public.module_dependencies TO service_role;

ALTER TABLE public.module_dependencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read module_dependencies"
ON public.module_dependencies FOR SELECT TO authenticated USING (true);

CREATE POLICY "Super admins manage module_dependencies"
ON public.module_dependencies FOR ALL TO authenticated
USING (public.is_super_admin((SELECT auth.uid())))
WITH CHECK (public.is_super_admin((SELECT auth.uid())));

CREATE TRIGGER trg_module_dependencies_updated_at
BEFORE UPDATE ON public.module_dependencies
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();