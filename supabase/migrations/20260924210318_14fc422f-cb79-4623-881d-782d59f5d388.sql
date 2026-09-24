DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'dp_colaboradores','dp_colaborador_config_trabalho','dp_colaborador_config_dias','dp_colaborador_historico_condicoes',
    'dp_registros_disciplinares','dp_documento_aceites',
    'dp_convocacoes','dp_convocacao_destinatarios','dp_convocacao_grupos','dp_convocacao_ocorrencias',
    'dp_convocacao_descumprimentos','dp_convocacao_eventos','dp_convocacao_config',
    'dp_ferias_periodos','dp_ferias_gozos','dp_ferias_regras','dp_ferias_bloqueios','dp_ferias_faltas_historico','dp_ferias_solicitacao_detalhes',
    'dp_folgas','dp_pendencias_apuracoes','dp_pendencias_materializadas','dp_folga_autoatribuicao_execucoes']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS perm_matriz_insert ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS perm_matriz_update ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS perm_matriz_delete ON public.%I', t);
    IF t <> 'dp_folgas' THEN
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM anon, authenticated', t);
    ELSE
      EXECUTE format('REVOKE UPDATE ON public.%I FROM anon, authenticated', t);
      EXECUTE format('REVOKE INSERT, DELETE ON public.%I FROM anon', t);
    END IF;
  END LOOP;
END $$;