
DROP POLICY IF EXISTS dp_colab_member_read ON public.dp_colaboradores;
CREATE POLICY dp_colab_admin_read ON public.dp_colaboradores
FOR SELECT USING (
  private.is_company_admin_or_owner(auth.uid(), company_id)
  OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = dp_colaboradores.company_id AND c.user_id = auth.uid())
  OR is_super_admin(auth.uid())
);
CREATE POLICY dp_colab_self_read ON public.dp_colaboradores
FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS dp_doc_member_read ON public.dp_documentos;
CREATE POLICY dp_doc_admin_read ON public.dp_documentos
FOR SELECT USING (
  private.is_company_admin_or_owner(auth.uid(), company_id)
  OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = dp_documentos.company_id AND c.user_id = auth.uid())
  OR is_super_admin(auth.uid())
);

DROP POLICY IF EXISTS dp_mensagens_read ON public.dp_mensagens;
CREATE POLICY dp_mensagens_admin_read ON public.dp_mensagens
FOR SELECT USING (
  private.is_company_admin_or_owner(auth.uid(), company_id)
  OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = dp_mensagens.company_id AND c.user_id = auth.uid())
  OR is_super_admin(auth.uid())
);

ALTER VIEW public.transaction_sources SET (security_invoker = true);
