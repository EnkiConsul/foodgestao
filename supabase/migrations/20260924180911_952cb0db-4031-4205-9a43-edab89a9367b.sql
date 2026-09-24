DO $$
DECLARE t text; item text;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN information_schema.columns col ON col.table_schema='public' AND col.table_name=c.relname AND col.column_name='company_id'
    WHERE n.nspname='public' AND c.relkind='r' AND c.relname LIKE 'dp\_%'
  LOOP
    item := CASE
      WHEN t IN ('dp_portal_access_tokens','dp_colaborador_desligamento_restrito','dp_user_prefs','dp_acesso_concessoes','dp_menu_defaults')
        OR t LIKE 'dp_legacy_%' OR t LIKE 'dp_bulk_%' THEN NULL
      WHEN t LIKE 'dp_convoca%' OR t = 'dp_intermitente_competencia_confirmacoes' OR t='dp_indisponibilidades' THEN 'dp.convocacoes'
      WHEN t LIKE 'dp_folga%' OR t IN ('dp_datas_bloqueadas','dp_bloqueio_regras','dp_bloqueios','dp_trocas','dp_prioridade_aniversario','dp_solicitacoes') THEN 'dp.folgas'
      WHEN t LIKE 'dp_ferias%' THEN 'dp.ferias'
      WHEN t LIKE 'dp_escala%' OR t LIKE 'dp_jornada%' OR t IN ('dp_turnos','dp_cobertura_minima','dp_dia_config','dp_dia_trabalho_excepcional','dp_colaborador_config_dias','dp_colaborador_config_trabalho','dp_colaborador_jornadas','dp_operacao_alertas_dispensas','dp_apoio_unidades','dp_pessoas_apoio','dp_pessoas_avulsas') THEN 'dp.escalas'
      WHEN t LIKE 'dp_ocorrencia%' OR t IN ('dp_registros_disciplinares','dp_pendencias_apuracoes','dp_pendencias_config','dp_pendencias_decisoes','dp_pendencias_materializadas') THEN 'dp.ocorrencias'
      WHEN t LIKE 'dp_documento%' OR t LIKE 'dp_doc_%' OR t IN ('dp_colaborador_documentos','dp_requisito_cargos','dp_requisito_unidades') THEN 'dp.documentos'
      WHEN t LIKE 'dp_aviso%' OR t IN ('dp_mensagens','dp_modelos_mensagem','dp_notificacoes') THEN 'dp.avisos'
      WHEN t LIKE 'dp_beneficio%' OR t IN ('dp_colaborador_beneficios','dp_va_apuracoes','dp_adiantamento_solicitacoes') THEN 'dp.beneficios'
      WHEN t IN ('dp_cargos','dp_cargo_salarios','dp_setores','dp_unidades','dp_unidade_feriados','dp_unidade_horarios_funcionamento','dp_sindicatos','dp_sindicato_negociacoes','dp_config_dp','dp_regras_historico','dp_adicionais_tempo_servico') OR t LIKE 'dp_admissao_regra%' THEN 'dp.cadastros'
      ELSE 'dp.colaboradores'
    END;
    IF item IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP POLICY IF EXISTS perm_matriz_select ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS perm_matriz_insert ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS perm_matriz_update ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS perm_matriz_delete ON public.%I', t);
    EXECUTE format('CREATE POLICY perm_matriz_select ON public.%I FOR SELECT TO authenticated USING (public.tem_permissao(company_id, %L, ''consulta''))', t, item);
    EXECUTE format('CREATE POLICY perm_matriz_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (public.tem_permissao(company_id, %L, ''inclusao''))', t, item);
    EXECUTE format('CREATE POLICY perm_matriz_update ON public.%I FOR UPDATE TO authenticated USING (public.tem_permissao(company_id, %L, ''alteracao'')) WITH CHECK (public.tem_permissao(company_id, %L, ''alteracao''))', t, item, item);
    EXECUTE format('CREATE POLICY perm_matriz_delete ON public.%I FOR DELETE TO authenticated USING (public.tem_permissao(company_id, %L, ''total''))', t, item);
  END LOOP;
END $$;