-- =====================================================================
-- Pré-Admissão — cliente somente leitura (writes apenas via rotinas do servidor)
-- ROLLBACK (não destrutivo): recriar as policies FOR ALL anteriores, por exemplo
--   CREATE POLICY dp_preadm_admin_all ON public.dp_preadmissoes FOR ALL TO authenticated
--     USING (private.is_company_admin_or_owner(auth.uid(), company_id) OR public.is_super_admin(auth.uid()))
--     WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));
--   (idem para convites, pessoas e documentos) e GRANT INSERT, UPDATE, DELETE quando desejado.
-- =====================================================================

DROP POLICY IF EXISTS dp_preadm_admin_all ON public.dp_preadmissoes;
DROP POLICY IF EXISTS dp_preadm_conv_admin_all ON public.dp_preadmissao_convites;
DROP POLICY IF EXISTS dp_preadm_pessoa_admin_all ON public.dp_preadmissao_pessoas;
DROP POLICY IF EXISTS dp_preadm_doc_admin_all ON public.dp_preadmissao_documentos;

CREATE POLICY dp_preadm_admin_read ON public.dp_preadmissoes
  FOR SELECT TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id) OR public.is_super_admin(auth.uid()));

CREATE POLICY dp_preadm_conv_admin_read ON public.dp_preadmissao_convites
  FOR SELECT TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id) OR public.is_super_admin(auth.uid()));

CREATE POLICY dp_preadm_pessoa_admin_read ON public.dp_preadmissao_pessoas
  FOR SELECT TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id) OR public.is_super_admin(auth.uid()));

CREATE POLICY dp_preadm_doc_admin_read ON public.dp_preadmissao_documentos
  FOR SELECT TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id) OR public.is_super_admin(auth.uid()));

-- Reafirma privilégios: leitura para o app, escrita apenas para as rotinas do servidor.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.dp_preadmissoes, public.dp_preadmissao_convites, public.dp_preadmissao_pessoas,
     public.dp_preadmissao_documentos, public.dp_preadmissao_eventos
  FROM authenticated;
REVOKE ALL ON public.dp_preadmissoes, public.dp_preadmissao_convites, public.dp_preadmissao_pessoas,
              public.dp_preadmissao_documentos, public.dp_preadmissao_eventos
  FROM anon;
GRANT SELECT ON public.dp_preadmissoes, public.dp_preadmissao_convites, public.dp_preadmissao_pessoas,
                public.dp_preadmissao_documentos, public.dp_preadmissao_eventos
  TO authenticated;
GRANT ALL ON public.dp_preadmissoes, public.dp_preadmissao_convites, public.dp_preadmissao_pessoas,
             public.dp_preadmissao_documentos, public.dp_preadmissao_eventos
  TO service_role;