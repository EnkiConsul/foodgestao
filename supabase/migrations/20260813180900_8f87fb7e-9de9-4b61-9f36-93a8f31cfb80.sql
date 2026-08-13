ALTER TABLE public.modulos_catalogo
  ADD COLUMN IF NOT EXISTS show_on_landing boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_on_hub boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

GRANT SELECT ON public.modulos_catalogo TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.modulos_catalogo TO authenticated;
GRANT ALL ON public.modulos_catalogo TO service_role;

DROP POLICY IF EXISTS modulos_catalogo_select_anon ON public.modulos_catalogo;
CREATE POLICY modulos_catalogo_select_anon
  ON public.modulos_catalogo FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS modulos_catalogo_admin_write ON public.modulos_catalogo;
CREATE POLICY modulos_catalogo_admin_write
  ON public.modulos_catalogo FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

DROP TRIGGER IF EXISTS set_modulos_catalogo_updated_at ON public.modulos_catalogo;
CREATE TRIGGER set_modulos_catalogo_updated_at
  BEFORE UPDATE ON public.modulos_catalogo
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();