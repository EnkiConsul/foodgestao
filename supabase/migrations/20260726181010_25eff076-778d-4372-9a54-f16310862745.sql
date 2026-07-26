
-- 1) NULL edge case guards for colaborador self-service policies
DROP POLICY IF EXISTS dp_folgas_self_insert ON public.dp_folgas;
CREATE POLICY dp_folgas_self_insert ON public.dp_folgas
  FOR INSERT TO authenticated
  WITH CHECK (
    colaborador_id IS NOT NULL
    AND dp_colaborador_of(auth.uid()) IS NOT NULL
    AND colaborador_id = dp_colaborador_of(auth.uid())
    AND company_id = (SELECT c.company_id FROM dp_colaboradores c WHERE c.id = dp_colaborador_of(auth.uid()))
    AND criado_por = auth.uid()
    AND origem = 'solicitacao'::dp_folga_origem
    AND extra = false
    AND tipo = 'normal'::dp_folga_tipo
    AND status = 'agendada'::dp_folga_status
  );

DROP POLICY IF EXISTS dp_folgas_self_delete ON public.dp_folgas;
CREATE POLICY dp_folgas_self_delete ON public.dp_folgas
  FOR DELETE TO authenticated
  USING (
    colaborador_id IS NOT NULL
    AND dp_colaborador_of(auth.uid()) IS NOT NULL
    AND colaborador_id = dp_colaborador_of(auth.uid())
    AND criado_por = auth.uid()
    AND origem = 'solicitacao'::dp_folga_origem
    AND status = 'agendada'::dp_folga_status
    AND data >= CURRENT_DATE
  );

DROP POLICY IF EXISTS dp_sol_colab_self_read ON public.dp_solicitacoes;
CREATE POLICY dp_sol_colab_self_read ON public.dp_solicitacoes
  FOR SELECT TO authenticated
  USING (
    colaborador_id IS NOT NULL
    AND dp_colaborador_of(auth.uid()) IS NOT NULL
    AND colaborador_id = dp_colaborador_of(auth.uid())
  );

DROP POLICY IF EXISTS dp_sol_colab_self_write ON public.dp_solicitacoes;
CREATE POLICY dp_sol_colab_self_write ON public.dp_solicitacoes
  FOR INSERT TO authenticated
  WITH CHECK (
    colaborador_id IS NOT NULL
    AND dp_colaborador_of(auth.uid()) IS NOT NULL
    AND colaborador_id = dp_colaborador_of(auth.uid())
    AND company_id = (SELECT c.company_id FROM dp_colaboradores c WHERE c.id = dp_colaborador_of(auth.uid()))
  );

-- 2) Email internal tables: scope policies explicitly to service_role, revoke ambient grants
REVOKE ALL ON public.email_send_state FROM anon, authenticated;
REVOKE ALL ON public.email_send_log FROM anon, authenticated;
REVOKE ALL ON public.suppressed_emails FROM anon, authenticated;
REVOKE ALL ON public.email_unsubscribe_tokens FROM anon, authenticated;
GRANT ALL ON public.email_send_state TO service_role;
GRANT ALL ON public.email_send_log TO service_role;
GRANT ALL ON public.suppressed_emails TO service_role;
GRANT ALL ON public.email_unsubscribe_tokens TO service_role;

DROP POLICY IF EXISTS "Service role can insert send log" ON public.email_send_log;
DROP POLICY IF EXISTS "Service role can read send log" ON public.email_send_log;
DROP POLICY IF EXISTS "Service role can update send log" ON public.email_send_log;
CREATE POLICY "Service role manages send log" ON public.email_send_log FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can manage send state" ON public.email_send_state;
CREATE POLICY "Service role manages send state" ON public.email_send_state FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can insert tokens" ON public.email_unsubscribe_tokens;
DROP POLICY IF EXISTS "Service role can mark tokens as used" ON public.email_unsubscribe_tokens;
DROP POLICY IF EXISTS "Service role can read tokens" ON public.email_unsubscribe_tokens;
CREATE POLICY "Service role manages unsubscribe tokens" ON public.email_unsubscribe_tokens FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can insert suppressed emails" ON public.suppressed_emails;
DROP POLICY IF EXISTS "Service role can read suppressed emails" ON public.suppressed_emails;
CREATE POLICY "Service role manages suppressed emails" ON public.suppressed_emails FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3) transaction_tags: require tag ownership to match transaction owner/company
DROP POLICY IF EXISTS "Users can manage own transaction tags" ON public.transaction_tags;
CREATE POLICY "Users can manage own transaction tags" ON public.transaction_tags
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = transaction_tags.transaction_id AND t.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.tags g WHERE g.id = transaction_tags.tag_id AND g.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = transaction_tags.transaction_id AND t.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.tags g WHERE g.id = transaction_tags.tag_id AND g.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Company members can manage company transaction tags" ON public.transaction_tags;
CREATE POLICY "Company members can manage company transaction tags" ON public.transaction_tags
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.transactions t
      WHERE t.id = transaction_tags.transaction_id
        AND t.company_id IS NOT NULL
        AND private.is_company_member(auth.uid(), t.company_id)
    )
    AND EXISTS (
      SELECT 1 FROM public.tags g
      JOIN public.transactions t2 ON t2.id = transaction_tags.transaction_id
      WHERE g.id = transaction_tags.tag_id
        AND (
          g.user_id = auth.uid()
          OR private.is_company_member(auth.uid(), t2.company_id)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.transactions t
      WHERE t.id = transaction_tags.transaction_id
        AND t.company_id IS NOT NULL
        AND private.is_company_member(auth.uid(), t.company_id)
    )
    AND EXISTS (
      SELECT 1 FROM public.tags g
      JOIN public.transactions t2 ON t2.id = transaction_tags.transaction_id
      WHERE g.id = transaction_tags.tag_id
        AND (
          g.user_id = auth.uid()
          OR private.is_company_member(auth.uid(), t2.company_id)
        )
    )
  );
