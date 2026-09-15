-- Fase 12 — fechamento técnico do módulo Pessoas.
-- 1) Menor privilégio: 35 funções de gatilho (RETURNS trigger) deixam de ter
--    EXECUTE para anon/authenticated/PUBLIC. Gatilhos continuam funcionando:
--    a permissão é verificada na criação do gatilho, não na execução.
-- 2) Metadados de documento disciplinar deixam de ser legíveis pelo colaborador
--    (alinha a regra da tabela com a regra do arquivo no Storage).
-- 3) Remove o desvio `auth.uid() IS NULL` das rotinas de identificação do
--    colaborador — sobra apenas o caminho service_role (fail closed).
-- Rollback: ver docs/security/fase12-fechamento-pessoas.md.

REVOKE ALL ON FUNCTION public.categories_autogen_template_code() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.categories_guard_parent_company() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.categories_guard_parent_scope() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.dp_beneficios_padroes_guard() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.dp_bloquear_cadastro_legado() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.dp_bloquear_durante_ferias() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.dp_cadastro_solicitacoes_guard() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.dp_cargo_salarios_guard() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.dp_colaborador_desligamento_guard() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.dp_config_dp_seed_on_company() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.dp_convocacao_aplicar_nivel() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.dp_convocacao_bloqueia_resposta_antecipada() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.dp_convocacao_guard() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.dp_convocacao_legacy_self_columns() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.dp_convocacao_sync_escala() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.dp_dependentes_guard() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.dp_dependentes_sync_irrf() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.dp_ferias_gozo_after() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.dp_ferias_gozo_validar() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.dp_ferias_gozo_validar_regras() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.dp_notif_disciplinar() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.dp_notif_solicitacao() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.dp_notif_troca() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.dp_ponto_ajuste_guard() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.dp_ponto_guard() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.dp_sindicato_vinculo_guard() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.dp_validar_jornada_menor() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_auth_user_security_state() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.guard_company_modules_trial() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_company_id_transfer() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_company_ownership_transfer() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.seed_default_categories_on_company() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.seed_default_contacts_on_company() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.seed_default_payment_methods_on_company() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.sync_dp_colaborador_role() FROM anon, authenticated, PUBLIC;

DROP POLICY IF EXISTS dp_doc_colab_self_read ON public.dp_documentos;
CREATE POLICY dp_doc_colab_self_read ON public.dp_documentos
  FOR SELECT TO authenticated
  USING (
    colaborador_id IS NOT NULL
    AND colaborador_id = public.dp_colaborador_of((SELECT auth.uid()))
    AND tipo <> 'disciplinar'::public.dp_documento_tipo
  );

CREATE OR REPLACE FUNCTION public.dp_colaborador_of(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT d.colaborador_id
  FROM private.dp_portal_decisao(_user_id) d
  WHERE _user_id IS NOT NULL
    AND (
      _user_id = auth.uid()
      OR current_setting('request.jwt.claim.role', true) = 'service_role'
      OR auth.role() = 'service_role'
    )
    AND d.estado IN ('ativo','desligado_no_prazo');
$function$;

CREATE OR REPLACE FUNCTION public.dp_colaborador_ativo_of(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT d.colaborador_id
  FROM private.dp_portal_decisao(_user_id) d
  WHERE _user_id IS NOT NULL
    AND (
      _user_id = auth.uid()
      OR current_setting('request.jwt.claim.role', true) = 'service_role'
      OR auth.role() = 'service_role'
    )
    AND d.estado = 'ativo';
$function$;
