
-- 1) Restrict reference tables to authenticated users only
DROP POLICY IF EXISTS "root_meta_read_all" ON public.chart_accounts_root_meta;
CREATE POLICY "root_meta_read_authenticated" ON public.chart_accounts_root_meta
  FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.chart_accounts_root_meta FROM anon;

DROP POLICY IF EXISTS "segmentos_select_all" ON public.segmentos;
CREATE POLICY "segmentos_select_authenticated" ON public.segmentos
  FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.segmentos FROM anon;

DROP POLICY IF EXISTS "modulos_catalogo_select_all" ON public.modulos_catalogo;
CREATE POLICY "modulos_catalogo_select_authenticated" ON public.modulos_catalogo
  FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.modulos_catalogo FROM anon;

-- category_templates already restricted to authenticated, ensure anon has no grant
REVOKE SELECT ON public.category_templates FROM anon;

-- 2) dp_cadastro_solicitacoes: require valid, active company on insert
DROP POLICY IF EXISTS "public_can_create_cadastro" ON public.dp_cadastro_solicitacoes;
CREATE POLICY "public_can_create_cadastro" ON public.dp_cadastro_solicitacoes
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    status = 'pendente'::dp_aprovacao_status
    AND EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = dp_cadastro_solicitacoes.company_id
        AND COALESCE(c.is_active, true) = true
    )
  );

-- 3) Realtime topic policy: enforce strict UUID-anchored format
DROP POLICY IF EXISTS "Users can subscribe to own topics" ON realtime.messages;
CREATE POLICY "Users can subscribe to own topics" ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    realtime.topic() ~ ('^sync-pf-' || (auth.uid())::text || '-[a-zA-Z0-9_.:-]{1,64}$')
    OR EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
        AND realtime.topic() ~ ('^sync-pj-' || (cm.company_id)::text || '-[a-zA-Z0-9_.:-]{1,64}$')
    )
  );
