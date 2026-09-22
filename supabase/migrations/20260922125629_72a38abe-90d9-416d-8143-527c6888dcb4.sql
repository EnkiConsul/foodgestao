-- Ficha e condições: leitura pelo app, gravação apenas pelas rotinas oficiais.
DROP POLICY IF EXISTS dp_colab_admin_write ON public.dp_colaboradores;
DROP POLICY IF EXISTS dp_cct_admin_write ON public.dp_colaborador_config_trabalho;
DROP POLICY IF EXISTS dp_ccd_admin_write ON public.dp_colaborador_config_dias;
DROP POLICY IF EXISTS "Admin/owner gerencia histórico de condições" ON public.dp_colaborador_historico_condicoes;
DROP POLICY IF EXISTS dp_folgas_admin_write ON public.dp_folgas;
DROP POLICY IF EXISTS dp_disc_write ON public.dp_registros_disciplinares;
DROP POLICY IF EXISTS dp_doc_aceites_admin_insert ON public.dp_documento_aceites;

CREATE POLICY dp_cct_admin_read ON public.dp_colaborador_config_trabalho
  FOR SELECT TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id));

CREATE POLICY dp_ccd_admin_read ON public.dp_colaborador_config_dias
  FOR SELECT TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id));

CREATE POLICY dp_colab_historico_admin_read ON public.dp_colaborador_historico_condicoes
  FOR SELECT TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id));

CREATE POLICY dp_disc_admin_read ON public.dp_registros_disciplinares
  FOR SELECT TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id));

REVOKE INSERT, UPDATE, DELETE ON public.dp_colaboradores FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.dp_colaborador_config_trabalho FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.dp_colaborador_config_dias FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.dp_colaborador_historico_condicoes FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.dp_registros_disciplinares FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.dp_documento_aceites FROM authenticated;
-- A folga escolhida pelo próprio colaborador continua permitida pelas políticas
-- dp_folgas_self_insert e dp_folgas_self_delete; a gestão passa pelas rotinas.
REVOKE UPDATE ON public.dp_folgas FROM authenticated;

REVOKE ALL ON public.dp_colaboradores FROM anon;
REVOKE ALL ON public.dp_colaborador_config_trabalho FROM anon;
REVOKE ALL ON public.dp_colaborador_config_dias FROM anon;
REVOKE ALL ON public.dp_colaborador_historico_condicoes FROM anon;
REVOKE ALL ON public.dp_folgas FROM anon;
REVOKE ALL ON public.dp_registros_disciplinares FROM anon;
REVOKE ALL ON public.dp_documento_aceites FROM anon;

GRANT ALL ON public.dp_colaboradores TO service_role;
GRANT ALL ON public.dp_colaborador_config_trabalho TO service_role;
GRANT ALL ON public.dp_colaborador_config_dias TO service_role;
GRANT ALL ON public.dp_colaborador_historico_condicoes TO service_role;
GRANT ALL ON public.dp_folgas TO service_role;
GRANT ALL ON public.dp_registros_disciplinares TO service_role;
GRANT ALL ON public.dp_documento_aceites TO service_role;