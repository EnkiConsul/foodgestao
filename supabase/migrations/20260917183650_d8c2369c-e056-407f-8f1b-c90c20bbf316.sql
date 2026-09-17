-- 1) Catálogos internos: exigir sessão autenticada real (remove USING (true))
DROP POLICY IF EXISTS "segmentos_select_authenticated" ON public.segmentos;
CREATE POLICY "segmentos_select_authenticated" ON public.segmentos
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Any authenticated user reads templates" ON public.category_templates;
CREATE POLICY "Any authenticated user reads templates" ON public.category_templates
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "chart_account_templates_read_authenticated" ON public.chart_account_templates;
CREATE POLICY "chart_account_templates_read_authenticated" ON public.chart_account_templates
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "root_meta_read_authenticated" ON public.chart_accounts_root_meta;
CREATE POLICY "root_meta_read_authenticated" ON public.chart_accounts_root_meta
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "pm_templates_read" ON public.payment_method_templates;
CREATE POLICY "pm_templates_read" ON public.payment_method_templates
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated can read module_dependencies" ON public.module_dependencies;
CREATE POLICY "Authenticated can read module_dependencies" ON public.module_dependencies
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "dp_doc_equivalencias_select" ON public.dp_doc_equivalencias;
CREATE POLICY "dp_doc_equivalencias_select" ON public.dp_doc_equivalencias
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Usuarios autenticados leem a config de telas ocultas" ON public.app_hidden_screens;
CREATE POLICY "Usuarios autenticados leem a config de telas ocultas" ON public.app_hidden_screens
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "app_table_layouts_read_all" ON public.app_table_layouts;
CREATE POLICY "app_table_layouts_read_all" ON public.app_table_layouts
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);

-- 2) Marketing: leitura pública apenas das chaves realmente públicas
DROP POLICY IF EXISTS "mkt_site_settings public read" ON public.mkt_site_settings;
CREATE POLICY "mkt_site_settings public read" ON public.mkt_site_settings
  FOR SELECT TO anon, authenticated
  USING (key IN ('contact'));
