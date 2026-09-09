CREATE OR REPLACE FUNCTION public.dp_ferias_gerar_periodos(_colaborador_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_col record;
  v_inicio date;
  v_fim date;
  v_limite date;
  v_corte date;
  v_criados int := 0;
BEGIN
  SELECT id, company_id, data_admissao, data_desligamento, vinculo_label
    INTO v_col
  FROM public.dp_colaboradores
  WHERE id = _colaborador_id;

  IF v_col.id IS NULL THEN
    RAISE EXCEPTION 'FERIAS_COLABORADOR_NAO_ENCONTRADO';
  END IF;

  IF NOT private.is_company_admin_or_owner(auth.uid(), v_col.company_id) THEN
    RAISE EXCEPTION 'FERIAS_SEM_PERMISSAO';
  END IF;

  -- Sócio não tem férias legais: nada é gerado e o histórico existente
  -- passa a ficar fora do controle (sem saldo cobrado nem alerta de prazo).
  IF COALESCE(v_col.vinculo_label, '') ILIKE 'socio%'
     OR COALESCE(v_col.vinculo_label, '') ILIKE 'sócio%' THEN
    UPDATE public.dp_ferias_periodos
       SET controle_externo = true,
           updated_at = now()
     WHERE colaborador_id = _colaborador_id
       AND controle_externo IS DISTINCT FROM true;
    RETURN 0;
  END IF;

  IF v_col.data_admissao IS NULL THEN
    RAISE EXCEPTION 'FERIAS_SEM_ADMISSAO';
  END IF;

  v_corte := COALESCE(public.dp_ferias_corte_efetivo(_colaborador_id), v_col.data_admissao);

  v_inicio := v_col.data_admissao;

  WHILE v_inicio <= COALESCE(v_col.data_desligamento, CURRENT_DATE) LOOP
    v_fim := (v_inicio + INTERVAL '1 year - 1 day')::date;
    v_limite := (v_fim + INTERVAL '1 year')::date;

    IF v_fim >= v_corte THEN
      INSERT INTO public.dp_ferias_periodos (
        company_id, colaborador_id, inicio_aquisitivo, fim_aquisitivo, limite_concessivo, criado_por
      ) VALUES (
        v_col.company_id, v_col.id, v_inicio, v_fim, v_limite, auth.uid()
      )
      ON CONFLICT (colaborador_id, inicio_aquisitivo) DO NOTHING;

      IF FOUND THEN v_criados := v_criados + 1; END IF;
    END IF;

    v_inicio := (v_inicio + INTERVAL '1 year')::date;
  END LOOP;

  UPDATE public.dp_ferias_periodos
     SET controle_externo = (fim_aquisitivo < v_corte),
         updated_at = now()
   WHERE colaborador_id = _colaborador_id
     AND controle_externo <> (fim_aquisitivo < v_corte);

  PERFORM public.dp_ferias_recalc_periodo(p.id)
  FROM public.dp_ferias_periodos p
  WHERE p.colaborador_id = _colaborador_id;

  RETURN v_criados;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_ferias_gerar_periodos(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_ferias_gerar_periodos(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_ferias_gerar_periodos(uuid) TO service_role;