-- Endurecimento de menor privilégio: revoga EXECUTE de rotinas internas/backend
-- para as roles anon/authenticated/PUBLIC, mantendo service_role.
-- Reversível: para reverter, execute
--   GRANT EXECUTE ON FUNCTION public.<nome>(<assinatura>) TO authenticated;
-- para cada rotina listada abaixo.
DO $$
DECLARE
  nomes text[] := ARRAY[
    -- Grupo B: exclusivas de Edge Functions (service_role)
    'apply_ai_categorization',
    'dp_admissao_regras_resolver',
    'dp_documento_aceitar',
    'dp_gerar_prioridades_aniversario',
    'dp_portal_acesso_revogar',
    'get_password_change_required',
    'get_user_plan_features',
    'pluggy_connection_in_cooldown',
    -- Grupo C: internas do banco (chamadas por triggers/outras funções)
    'assinatura_limite_excedido',
    'cron_health',
    'dp_capacidade_habitual_dia_cargo',
    'dp_cargos_salario_base',
    'dp_convocacao_exige_admin',
    'dp_convocacao_log_evento',
    'dp_convocacao_log_evento_trabalhador',
    'dp_convocacao_revisar_ocorrencia',
    'dp_documento_excluir_definitivo',
    'dp_ferias_validar_programacao',
    'dp_folga_escopo_empresa_ok',
    'dp_folga_reserva_indisponibilidade',
    'dp_folha_pendencias_remuneracao',
    'dp_gerar_folgas_clt',
    'dp_pessoa_apoio_upsert',
    'dp_pode_gerenciar_lixeira',
    'dp_preadmissao_efetivar',
    'dp_regra_bloqueia_data',
    'dp_setor_previsto_periodo',
    'minhas_contas_permitidas',
    'minhas_unidades_permitidas',
    'subscription_capacity',
    'subscription_total_cents'
  ];
  r record;
  afetadas int := 0;
BEGIN
  FOR r IN
    SELECT p.oid,
           p.proname,
           pg_catalog.pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (nomes)
      AND p.prorettype <> 'trigger'::regtype
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated',
      r.proname, r.args
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role',
      r.proname, r.args
    );
    afetadas := afetadas + 1;
  END LOOP;

  RAISE NOTICE 'Endurecimento aplicado em % rotinas.', afetadas;
END
$$;