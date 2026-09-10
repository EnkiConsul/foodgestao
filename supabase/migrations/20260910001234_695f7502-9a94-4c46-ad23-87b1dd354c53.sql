ALTER TABLE public.dp_colaborador_historico_condicoes
  ADD COLUMN IF NOT EXISTS turno_padrao_id UUID REFERENCES public.dp_turnos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS carga_semanal_horas NUMERIC,
  ADD COLUMN IF NOT EXISTS folga_variavel BOOLEAN,
  ADD COLUMN IF NOT EXISTS folga_fixa_dow SMALLINT,
  ADD COLUMN IF NOT EXISTS sindicato_id UUID REFERENCES public.dp_sindicatos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS compoe_equipe_habitual BOOLEAN,
  ADD COLUMN IF NOT EXISTS dias JSONB,
  ADD COLUMN IF NOT EXISTS beneficios JSONB;

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
  p_beneficios JSONB DEFAULT NULL
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
BEGIN
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

  INSERT INTO public.dp_colaborador_historico_condicoes (
    company_id, colaborador_id, usuario_id, vigencia_inicio, regime, forma_pagamento,
    cargo_id, unidade_id, setor_id, salario_base, valor_hora, base_horas_mes, base_dias_mes,
    justificativa, observacoes, turno_padrao_id, carga_semanal_horas, folga_variavel,
    folga_fixa_dow, sindicato_id, compoe_equipe_habitual, dias, beneficios
  ) VALUES (
    v_company_id, p_colaborador_id, auth.uid(), p_vigencia_inicio,
    NULLIF(p_regime, '')::public.dp_regime_trabalho,
    NULLIF(p_forma_pagamento, '')::public.dp_forma_pagamento,
    p_cargo_id, p_unidade_id, p_setor_id, p_salario_base, p_valor_hora,
    p_base_horas_mes, p_base_dias_mes, p_justificativa, p_observacoes,
    p_turno_padrao_id, p_carga_semanal_horas, p_folga_variavel,
    p_folga_fixa_dow, p_sindicato_id, p_compoe_equipe_habitual, p_dias, p_beneficios
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
    updated_at = now()
  WHERE id = p_colaborador_id;

  SELECT unidade_id INTO v_unidade_id FROM public.dp_colaboradores WHERE id = p_colaborador_id;

  -- Configuração de trabalho (turno, carga, folga) com vigência
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

  -- Benefícios do colaborador
  IF p_beneficios IS NOT NULL THEN
    FOR v_ben IN SELECT * FROM jsonb_array_elements(p_beneficios) LOOP
      INSERT INTO public.dp_colaborador_beneficios (
        company_id, colaborador_id, beneficio_id, ativo, valor, data_inicio
      ) VALUES (
        v_company_id,
        p_colaborador_id,
        (v_ben->>'beneficio_id')::UUID,
        COALESCE((v_ben->>'ativo')::BOOLEAN, false),
        NULLIF(v_ben->>'valor', '')::NUMERIC,
        p_vigencia_inicio
      )
      ON CONFLICT (colaborador_id, beneficio_id) DO UPDATE
      SET ativo = EXCLUDED.ativo,
          valor = EXCLUDED.valor,
          data_inicio = CASE WHEN EXCLUDED.ativo THEN EXCLUDED.data_inicio ELSE public.dp_colaborador_beneficios.data_inicio END,
          data_fim = CASE WHEN EXCLUDED.ativo THEN NULL ELSE EXCLUDED.data_inicio END,
          updated_at = now();
    END LOOP;
  END IF;

  RETURN v_historico_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dp_colaborador_aplicar_condicao(UUID, DATE, TEXT, TEXT, UUID, UUID, UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, UUID, NUMERIC, BOOLEAN, SMALLINT, UUID, BOOLEAN, JSONB, JSONB) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_colaborador_aplicar_condicao(UUID, DATE, TEXT, TEXT, UUID, UUID, UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, UUID, NUMERIC, BOOLEAN, SMALLINT, UUID, BOOLEAN, JSONB, JSONB) TO authenticated, service_role;