ALTER TABLE public.dp_colaboradores
  ADD COLUMN IF NOT EXISTS data_base_contagem DATE;

COMMENT ON COLUMN public.dp_colaboradores.data_base_contagem IS
  'Data em que a contagem de férias, 13º e tempo de casa recomeça (novo contrato). NULL = usa data_admissao.';

ALTER TABLE public.dp_colaborador_historico_condicoes
  ADD COLUMN IF NOT EXISTS modo_continuidade TEXT NOT NULL DEFAULT 'continuidade';

ALTER TABLE public.dp_colaborador_historico_condicoes
  DROP CONSTRAINT IF EXISTS dp_hist_cond_modo_continuidade_check;
ALTER TABLE public.dp_colaborador_historico_condicoes
  ADD CONSTRAINT dp_hist_cond_modo_continuidade_check
  CHECK (modo_continuidade IN ('continuidade', 'novo_contrato'));

-- Férias passam a contar da base do contrato vigente
CREATE OR REPLACE FUNCTION public.dp_ferias_gerar_periodos(_colaborador_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_col record;
  v_base date;
  v_inicio date;
  v_fim date;
  v_limite date;
  v_corte date;
  v_criados int := 0;
BEGIN
  SELECT id, company_id, data_admissao, data_base_contagem, data_desligamento, vinculo_label
    INTO v_col
  FROM public.dp_colaboradores
  WHERE id = _colaborador_id;

  IF v_col.id IS NULL THEN
    RAISE EXCEPTION 'FERIAS_COLABORADOR_NAO_ENCONTRADO';
  END IF;

  IF NOT private.is_company_admin_or_owner(auth.uid(), v_col.company_id) THEN
    RAISE EXCEPTION 'FERIAS_SEM_PERMISSAO';
  END IF;

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

  v_base := GREATEST(COALESCE(v_col.data_base_contagem, v_col.data_admissao), v_col.data_admissao);
  v_corte := GREATEST(COALESCE(public.dp_ferias_corte_efetivo(_colaborador_id), v_base), v_base);

  v_inicio := v_base;

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
     SET controle_externo = (fim_aquisitivo < v_corte OR inicio_aquisitivo < v_base),
         updated_at = now()
   WHERE colaborador_id = _colaborador_id
     AND controle_externo <> (fim_aquisitivo < v_corte OR inicio_aquisitivo < v_base);

  PERFORM public.dp_ferias_recalc_periodo(p.id)
  FROM public.dp_ferias_periodos p
  WHERE p.colaborador_id = _colaborador_id;

  RETURN v_criados;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_ferias_gerar_periodos(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_ferias_gerar_periodos(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_ferias_gerar_periodos(uuid) TO service_role;

-- Aplicação da mudança de condições: consolida a vigência e trata o novo contrato
CREATE OR REPLACE FUNCTION public.dp_colaborador_aplicar_condicao(
  p_colaborador_id UUID,
  p_vigencia_inicio DATE,
  p_regime TEXT,
  p_forma_pagamento TEXT,
  p_cargo_id UUID,
  p_unidade_id UUID,
  p_setor_id UUID,
  p_salario_base NUMERIC,
  p_valor_hora NUMERIC,
  p_base_horas_mes NUMERIC,
  p_base_dias_mes NUMERIC,
  p_justificativa TEXT,
  p_observacoes TEXT,
  p_turno_padrao_id UUID DEFAULT NULL,
  p_carga_semanal_horas NUMERIC DEFAULT NULL,
  p_folga_variavel BOOLEAN DEFAULT NULL,
  p_folga_fixa_dow SMALLINT DEFAULT NULL,
  p_sindicato_id UUID DEFAULT NULL,
  p_compoe_equipe_habitual BOOLEAN DEFAULT NULL,
  p_dias JSONB DEFAULT NULL,
  p_beneficios JSONB DEFAULT NULL,
  p_modo_continuidade TEXT DEFAULT 'continuidade'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_historico_id UUID;
  v_unidade_id UUID;
  v_config_id UUID;
  v_dia JSONB;
  v_ben JSONB;
  v_ben_id UUID;
  v_ativo BOOLEAN;
  v_modo TEXT := COALESCE(NULLIF(p_modo_continuidade, ''), 'continuidade');
BEGIN
  IF v_modo NOT IN ('continuidade', 'novo_contrato') THEN
    RAISE EXCEPTION 'Modo de continuidade inválido';
  END IF;

  SELECT company_id INTO v_company_id
  FROM public.dp_colaboradores
  WHERE id = p_colaborador_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Colaborador não encontrado';
  END IF;

  IF NOT (
    private.is_company_admin_or_owner(auth.uid(), v_company_id)
    OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = v_company_id AND c.user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Sem permissão para alterar condições deste colaborador';
  END IF;

  UPDATE public.dp_colaborador_historico_condicoes
  SET vigencia_fim = p_vigencia_inicio - INTERVAL '1 day'
  WHERE colaborador_id = p_colaborador_id
    AND vigencia_fim IS NULL
    AND vigencia_inicio < p_vigencia_inicio;

  -- Salvar por etapas na mesma data não cria linhas repetidas.
  DELETE FROM public.dp_colaborador_historico_condicoes
  WHERE colaborador_id = p_colaborador_id
    AND vigencia_inicio = p_vigencia_inicio;

  INSERT INTO public.dp_colaborador_historico_condicoes (
    company_id, colaborador_id, usuario_id, vigencia_inicio, regime, forma_pagamento,
    cargo_id, unidade_id, setor_id, salario_base, valor_hora, base_horas_mes, base_dias_mes,
    justificativa, observacoes, turno_padrao_id, carga_semanal_horas, folga_variavel,
    folga_fixa_dow, sindicato_id, compoe_equipe_habitual, dias, beneficios, modo_continuidade
  ) VALUES (
    v_company_id, p_colaborador_id, auth.uid(), p_vigencia_inicio,
    NULLIF(p_regime, '')::public.dp_regime_trabalho,
    NULLIF(p_forma_pagamento, '')::public.dp_forma_pagamento,
    p_cargo_id, p_unidade_id, p_setor_id, p_salario_base, p_valor_hora,
    p_base_horas_mes, p_base_dias_mes, p_justificativa, p_observacoes,
    p_turno_padrao_id, p_carga_semanal_horas, p_folga_variavel,
    p_folga_fixa_dow, p_sindicato_id, p_compoe_equipe_habitual, p_dias, p_beneficios, v_modo
  ) RETURNING id INTO v_historico_id;

  UPDATE public.dp_colaboradores
  SET
    regime = COALESCE(NULLIF(p_regime, '')::public.dp_regime_trabalho, regime),
    forma_pagamento = COALESCE(NULLIF(p_forma_pagamento, '')::public.dp_forma_pagamento, forma_pagamento),
    cargo_id = COALESCE(p_cargo_id, cargo_id),
    unidade_id = COALESCE(p_unidade_id, unidade_id),
    setor_id = COALESCE(p_setor_id, setor_id),
    salario_base = CASE WHEN p_forma_pagamento = 'mensalista' THEN p_salario_base ELSE COALESCE(p_salario_base, salario_base) END,
    valor_hora = COALESCE(p_valor_hora, valor_hora),
    base_horas_mes = COALESCE(p_base_horas_mes, base_horas_mes),
    base_dias_mes = COALESCE(p_base_dias_mes, base_dias_mes),
    sindicato_id = COALESCE(p_sindicato_id, sindicato_id),
    data_base_contagem = CASE
      WHEN v_modo = 'novo_contrato' THEN p_vigencia_inicio
      ELSE data_base_contagem
    END,
    updated_at = now()
  WHERE id = p_colaborador_id;

  SELECT unidade_id INTO v_unidade_id FROM public.dp_colaboradores WHERE id = p_colaborador_id;

  IF p_turno_padrao_id IS NOT NULL OR p_carga_semanal_horas IS NOT NULL OR p_dias IS NOT NULL THEN
    UPDATE public.dp_colaborador_config_trabalho
    SET vigencia_fim = p_vigencia_inicio - INTERVAL '1 day', updated_at = now()
    WHERE colaborador_id = p_colaborador_id
      AND vigencia_fim IS NULL
      AND vigencia_inicio < p_vigencia_inicio;

    DELETE FROM public.dp_colaborador_config_trabalho
    WHERE colaborador_id = p_colaborador_id
      AND vigencia_inicio = p_vigencia_inicio;

    INSERT INTO public.dp_colaborador_config_trabalho (
      company_id, colaborador_id, unidade_id, turno_padrao_id, carga_semanal_horas,
      folga_variavel, folga_fixa_dow, vigencia_inicio, compoe_equipe_habitual, observacoes
    ) VALUES (
      v_company_id, p_colaborador_id, v_unidade_id, p_turno_padrao_id, p_carga_semanal_horas,
      COALESCE(p_folga_variavel, false), p_folga_fixa_dow, p_vigencia_inicio,
      COALESCE(p_compoe_equipe_habitual, true), p_observacoes
    ) RETURNING id INTO v_config_id;

    IF p_dias IS NOT NULL THEN
      FOR v_dia IN SELECT * FROM jsonb_array_elements(p_dias) LOOP
        INSERT INTO public.dp_colaborador_config_dias (
          company_id, config_id, dow, trabalha, turno_id, entrada, saida, intervalo_minutos, setor_id
        ) VALUES (
          v_company_id,
          v_config_id,
          (v_dia->>'dow')::SMALLINT,
          COALESCE((v_dia->>'trabalha')::BOOLEAN, false),
          NULLIF(v_dia->>'turno_id', '')::UUID,
          NULLIF(v_dia->>'entrada', '')::TIME,
          NULLIF(v_dia->>'saida', '')::TIME,
          NULLIF(v_dia->>'intervalo_minutos', '')::INT,
          NULLIF(v_dia->>'setor_id', '')::UUID
        );
      END LOOP;
    END IF;
  END IF;

  IF p_beneficios IS NOT NULL THEN
    FOR v_ben IN SELECT * FROM jsonb_array_elements(p_beneficios) LOOP
      v_ben_id := (v_ben->>'beneficio_id')::UUID;
      v_ativo := COALESCE((v_ben->>'ativo')::BOOLEAN, false);

      UPDATE public.dp_colaborador_beneficios
      SET ativo = false,
          data_fim = LEAST(COALESCE(data_fim, p_vigencia_inicio - 1), p_vigencia_inicio - 1),
          updated_at = now()
      WHERE colaborador_id = p_colaborador_id
        AND beneficio_id = v_ben_id
        AND data_inicio < p_vigencia_inicio;

      DELETE FROM public.dp_colaborador_beneficios
      WHERE colaborador_id = p_colaborador_id
        AND beneficio_id = v_ben_id
        AND data_inicio >= p_vigencia_inicio;

      IF v_ativo THEN
        INSERT INTO public.dp_colaborador_beneficios (
          company_id, colaborador_id, beneficio_id, ativo, valor, data_inicio
        ) VALUES (
          v_company_id, p_colaborador_id, v_ben_id, true,
          NULLIF(v_ben->>'valor', '')::NUMERIC, p_vigencia_inicio
        );
      END IF;
    END LOOP;
  END IF;

  -- Novo contrato: o que era do vínculo anterior fica só como histórico e a
  -- contagem de férias recomeça na data informada.
  IF v_modo = 'novo_contrato' THEN
    UPDATE public.dp_ferias_periodos
       SET controle_externo = true, updated_at = now()
     WHERE colaborador_id = p_colaborador_id
       AND inicio_aquisitivo < p_vigencia_inicio
       AND controle_externo IS DISTINCT FROM true;

    BEGIN
      PERFORM public.dp_ferias_gerar_periodos(p_colaborador_id);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN v_historico_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dp_colaborador_aplicar_condicao(UUID, DATE, TEXT, TEXT, UUID, UUID, UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, UUID, NUMERIC, BOOLEAN, SMALLINT, UUID, BOOLEAN, JSONB, JSONB, TEXT) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_colaborador_aplicar_condicao(UUID, DATE, TEXT, TEXT, UUID, UUID, UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, UUID, NUMERIC, BOOLEAN, SMALLINT, UUID, BOOLEAN, JSONB, JSONB, TEXT) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.dp_colaborador_aplicar_condicao(UUID, DATE, TEXT, TEXT, UUID, UUID, UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, UUID, NUMERIC, BOOLEAN, SMALLINT, UUID, BOOLEAN, JSONB, JSONB);