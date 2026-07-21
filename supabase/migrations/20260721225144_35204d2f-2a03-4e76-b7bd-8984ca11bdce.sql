
-- 1. audit_logs (parent + all partitions): scope "Super admins can view audit logs" to authenticated
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'audit_logs',
    'audit_logs_2025_07','audit_logs_2025_08','audit_logs_2025_09','audit_logs_2025_10',
    'audit_logs_2025_11','audit_logs_2025_12','audit_logs_2026_01','audit_logs_2026_02',
    'audit_logs_2026_03','audit_logs_2026_04','audit_logs_2026_05','audit_logs_2026_06',
    'audit_logs_2026_07','audit_logs_2026_08','audit_logs_2026_09','audit_logs_2026_10',
    'audit_logs_default'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Super admins can view audit logs" ON public.%I;', tbl);
    EXECUTE format(
      'CREATE POLICY "Super admins can view audit logs" ON public.%I FOR SELECT TO authenticated USING (is_super_admin(auth.uid()));',
      tbl
    );
  END LOOP;
END $$;

-- 2. dp_colaboradores: scope admin_read + self_read to authenticated
DROP POLICY IF EXISTS "dp_colab_admin_read" ON public.dp_colaboradores;
CREATE POLICY "dp_colab_admin_read" ON public.dp_colaboradores
  FOR SELECT TO authenticated
  USING (
    private.is_company_admin_or_owner(auth.uid(), company_id)
    OR EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = dp_colaboradores.company_id AND c.user_id = auth.uid()
    )
    OR is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS "dp_colab_self_read" ON public.dp_colaboradores;
CREATE POLICY "dp_colab_self_read" ON public.dp_colaboradores
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 3. dp_documentos: scope admin_read to authenticated
DROP POLICY IF EXISTS "dp_doc_admin_read" ON public.dp_documentos;
CREATE POLICY "dp_doc_admin_read" ON public.dp_documentos
  FOR SELECT TO authenticated
  USING (
    private.is_company_admin_or_owner(auth.uid(), company_id)
    OR EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = dp_documentos.company_id AND c.user_id = auth.uid()
    )
    OR is_super_admin(auth.uid())
  );

-- 4. dp_mensagens: scope admin_read to authenticated
DROP POLICY IF EXISTS "dp_mensagens_admin_read" ON public.dp_mensagens;
CREATE POLICY "dp_mensagens_admin_read" ON public.dp_mensagens
  FOR SELECT TO authenticated
  USING (
    private.is_company_admin_or_owner(auth.uid(), company_id)
    OR EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = dp_mensagens.company_id AND c.user_id = auth.uid()
    )
    OR is_super_admin(auth.uid())
  );

-- 5. transaction_attachments: scope both policies to authenticated
DROP POLICY IF EXISTS "Company members can view company attachments" ON public.transaction_attachments;
CREATE POLICY "Company members can view company attachments" ON public.transaction_attachments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.transactions t
      WHERE t.id = transaction_attachments.transaction_id
        AND t.company_id IS NOT NULL
        AND private.is_company_member(auth.uid(), t.company_id)
    )
  );

DROP POLICY IF EXISTS "Users can manage own attachments" ON public.transaction_attachments;
CREATE POLICY "Users can manage own attachments" ON public.transaction_attachments
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 6. transaction_tags: scope to authenticated
DROP POLICY IF EXISTS "Users can manage own transaction tags" ON public.transaction_tags;
CREATE POLICY "Users can manage own transaction tags" ON public.transaction_tags
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.transactions t
      WHERE t.id = transaction_tags.transaction_id AND t.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.transactions t
      WHERE t.id = transaction_tags.transaction_id AND t.user_id = auth.uid()
    )
  );
