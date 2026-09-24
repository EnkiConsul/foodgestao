DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['dp_colaboradores','dp_escalas','dp_ocorrencias','dp_convocacoes','dp_convocacao_ocorrencias','dp_documentos','dp_pessoas_apoio','dp_pessoas_avulsas','dp_pendencias_materializadas','dp_colaborador_config_trabalho','dp_colaborador_historico_condicoes','dp_beneficios','dp_apoio_unidades'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS escopo_unidade ON public.%I', t);
    EXECUTE format('CREATE POLICY escopo_unidade ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.unidade_liberada(company_id, unidade_id)) WITH CHECK (public.unidade_liberada(company_id, unidade_id))', t);
  END LOOP;
  DROP POLICY IF EXISTS escopo_unidade ON public.dp_unidades;
  CREATE POLICY escopo_unidade ON public.dp_unidades AS RESTRICTIVE FOR ALL TO authenticated
    USING (public.unidade_liberada(company_id, id)) WITH CHECK (public.unidade_liberada(company_id, id));
END $$;
-- Reversão: DROP POLICY escopo_unidade ON cada tabela acima.