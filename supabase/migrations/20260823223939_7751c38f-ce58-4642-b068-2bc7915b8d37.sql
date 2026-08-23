CREATE TABLE public.app_table_layouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  screen_key text NOT NULL UNIQUE,
  column_order jsonb NOT NULL DEFAULT '[]'::jsonb,
  column_widths jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_table_layouts TO authenticated;
GRANT ALL ON public.app_table_layouts TO service_role;

ALTER TABLE public.app_table_layouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_table_layouts_read_all" ON public.app_table_layouts
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "app_table_layouts_super_admin_write" ON public.app_table_layouts
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER app_table_layouts_upd BEFORE UPDATE ON public.app_table_layouts
  FOR EACH ROW EXECUTE FUNCTION public.dp_set_updated_at();
