CREATE OR REPLACE FUNCTION public.dp_recontratar_colaborador(
  p_colaborador_id uuid,
  p_data_admissao date,
  p_regime text DEFAULT NULL::text,
  p_forma_pagamento text DEFAULT NULL::text,
  p_cargo_id uuid DEFAULT NULL::uuid,
  p_unidade_id uuid DEFAULT NULL::uuid,
  p_setor_id uuid DEFAULT NULL::uuid,
  p_salario_base numeric DEFAULT NULL::numeric,
  p_valor_hora numeric DEFAULT NULL::numeric,
  p_matricula text DEFAULT NULL::text,
  p_justificativa text DEFAULT NULL::text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id UUID;
  v_ativo BOOLEAN;
  v_desligamento DATE;
  v_admissao_anterior DATE;
  v_fim_anterior DATE;
  v_historico_id UUID;
  v_cfg public.dp_colaborador_config_trabalho;
  v_cfg_nova UUID;
BEGIN
  IF p_data_admissao IS NULL THEN
    RAISE EXCEPTION 'Informe a nova data de admissão';
  END IF;

  SELECT company_id, ativo, data_desligamento, data_admissao
    INTO v_company_id, v_ativo, v_desligamento, v_admissao_anterior
  FROM public.dp_colaboradores
  WHERE id = p_colaborador_id AND deleted_at IS NULL;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Colaborador não encontrado';
  END IF;

  IF NOT (
    private.is_company_admin_or_owner(auth.uid(), v_company_id)
    OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = v_company_id AND c.user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Sem permissão para recontratar colaboradores';
  END IF;

  -- Fila por colaborador: dois cliques simultâneos são atendidos em ordem.
  PERFORM pg_advisory_xact_lock(hashtextextended('dp_colaborador:' || p_colaborador_id::text, 0));

  SELECT company_id, ativo, data_desligamento, data_admissao
    INTO v_company_id, v_ativo, v_desligamento, v_admissao_anterior
  FROM public.dp_colaboradores
  WHERE id = p_colaborador_id AND deleted_at IS NULL;

  IF v_ativo IS TRUE AND v_desligamento IS NULL THEN
    -- Já recontratado nesta mesma data: operação idempotente.
    SELECT h.id INTO v_historico_id
      FROM public.dp_colaborador_historico_condicoes h
     WHERE h.colaborador_id = p_colaborador_id
       AND h.vigencia_inicio = p_data_admissao
       AND h.modo_continuidade = 'novo_contrato';
    IF v_historico_id IS NOT NULL AND v_admissao_anterior = p_data_admissao THEN
      RETURN v_historico_id;
    END IF;
    RAISE EXCEPTION 'Este colaborador já está ativo — a recontratação vale apenas para quem foi desligado';
  END IF;

  IF v_desligamento IS NOT NULL AND p_data_admissao <= v_desligamento THEN
    RAISE EXCEPTION 'A nova admissão precisa ser posterior à data do desligamento';
  END IF;

  v_fim_anterior := LEAST(COALESCE(v_desligamento, p_data_admissao - 1), p_data_admissao - 1);

  -- Configuração de trabalho vigente no vínculo anterior (base do histórico e da nova).
  SELECT c.* INTO v_cfg
    FROM public.dp_colaborador_config_trabalho c
   WHERE c.colaborador_id = p_colaborador_id
   ORDER BY c.vigencia_inicio DESC
   LIMIT 1;

  -- 1) Garante a linha do vínculo anterior no histórico (não existia nas fichas antigas).
  IF v_admissao_anterior IS NOT NULL
     AND v_admissao_anterior < p_data_admissao
     AND NOT EXISTS (
       SELECT 1 FROM public.dp_colaborador_historico_condicoes h
        WHERE h.colaborador_id = p_colaborador_id AND h.vigencia_inicio = v_admissao_anterior
     ) THEN
    INSERT INTO public.dp_colaborador_historico_condicoes (
      company_id, colaborador_id, usuario_id, vigencia_inicio, vigencia_fim,
      regime, forma_pagamento, cargo_id, unidade_id, setor_id, salario_base, valor_hora,
      turno_padrao_id, carga_semanal_horas, folga_variavel, folga_fixa_dow, sindicato_id,
      justificativa, observacoes, modo_continuidade
    )
    SELECT
      v_company_id, p_colaborador_id, auth.uid(), v_admissao_anterior, GREATEST(v_fim_anterior, v_admissao_anterior),
      c.regime, c.forma_pagamento, c.cargo_id, c.unidade_id, c.setor_id, c.salario_base, c.valor_hora,
      v_cfg.turno_padrao_id, v_cfg.carga_semanal_horas, v_cfg.folga_variavel, v_cfg.folga_fixa_dow, c.sindicato_id,
      'Vínculo anterior registrado na recontratação',
      'Período de ' || to_char(v_admissao_anterior, 'DD/MM/YYYY') || ' a '
        || to_char(GREATEST(v_fim_anterior, v_admissao_anterior), 'DD/MM/YYYY'),
      'continuidade'
    FROM public.dp_colaboradores c
    WHERE c.id = p_colaborador_id;
  END IF;

  -- 2) Fecha qualquer período ainda em aberto antes da nova admissão.
  UPDATE public.dp_colaborador_historico_condicoes
     SET vigencia_fim = GREATEST(v_fim_anterior, vigencia_inicio),
         updated_at = now()
   WHERE colaborador_id = p_colaborador_id
     AND vigencia_fim IS NULL
     AND vigencia_inicio < p_data_admissao;

  -- 3) Novo vínculo.
  INSERT INTO public.dp_colaborador_historico_condicoes (
    company_id, colaborador_id, usuario_id, vigencia_inicio, regime, forma_pagamento,
    cargo_id, unidade_id, setor_id, salario_base, valor_hora, justificativa, observacoes,
    modo_continuidade
  )
  SELECT
    v_company_id, p_colaborador_id, auth.uid(), p_data_admissao,
    COALESCE(NULLIF(p_regime, '')::public.dp_regime_trabalho, c.regime),
    COALESCE(NULLIF(p_forma_pagamento, '')::public.dp_forma_pagamento, c.forma_pagamento),
    COALESCE(p_cargo_id, c.cargo_id),
    COALESCE(p_unidade_id, c.unidade_id),
    COALESCE(p_setor_id, c.setor_id),
    COALESCE(p_salario_base, c.salario_base),
    COALESCE(p_valor_hora, c.valor_hora),
    COALESCE(NULLIF(p_justificativa, ''), 'Recontratação'),
    'Recontratação — novo vínculo a partir de ' || to_char(p_data_admissao, 'DD/MM/YYYY'),
    'novo_contrato'
  FROM public.dp_colaboradores c
  WHERE c.id = p_colaborador_id
  ON CONFLICT (colaborador_id, vigencia_inicio) DO UPDATE
    SET regime = EXCLUDED.regime,
        forma_pagamento = EXCLUDED.forma_pagamento,
        cargo_id = EXCLUDED.cargo_id,
        unidade_id = EXCLUDED.unidade_id,
        setor_id = EXCLUDED.setor_id,
        salario_base = EXCLUDED.salario_base,
        valor_hora = EXCLUDED.valor_hora,
        justificativa = EXCLUDED.justificativa,
        observacoes = EXCLUDED.observacoes,
        modo_continuidade = 'novo_contrato',
        vigencia_fim = NULL,
        updated_at = now()
  RETURNING id INTO v_historico_id;

  -- 4) Configuração de trabalho: encerra a do vínculo antigo e abre a do novo.
  IF v_cfg.id IS NOT NULL THEN
    UPDATE public.dp_colaborador_config_trabalho
       SET vigencia_fim = GREATEST(v_fim_anterior, vigencia_inicio),
           updated_at = now()
     WHERE id = v_cfg.id
       AND vigencia_inicio < p_data_admissao
       AND (vigencia_fim IS NULL OR vigencia_fim > v_fim_anterior);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.dp_colaborador_config_trabalho c
     WHERE c.colaborador_id = p_colaborador_id AND c.vigencia_inicio = p_data_admissao
  ) THEN
    INSERT INTO public.dp_colaborador_config_trabalho (
      company_id, colaborador_id, unidade_id, turno_padrao_id, carga_semanal_horas,
      folga_variavel, folga_fixa_dow, compoe_equipe_habitual, observacoes, vigencia_inicio
    ) VALUES (
      v_company_id, p_colaborador_id,
      COALESCE(p_unidade_id, v_cfg.unidade_id),
      v_cfg.turno_padrao_id, v_cfg.carga_semanal_horas,
      COALESCE(v_cfg.folga_variavel, true), v_cfg.folga_fixa_dow,
      COALESCE(v_cfg.compoe_equipe_habitual, true),
      'Recontratação — revise a jornada do novo vínculo',
      p_data_admissao
    )
    RETURNING id INTO v_cfg_nova;

    IF v_cfg.id IS NOT NULL THEN
      INSERT INTO public.dp_colaborador_config_dias (
        company_id, config_id, dow, trabalha, turno_id, entrada, saida, intervalo_minutos, setor_id
      )
      SELECT v_company_id, v_cfg_nova, d.dow, d.trabalha, d.turno_id, d.entrada, d.saida,
             d.intervalo_minutos, d.setor_id
        FROM public.dp_colaborador_config_dias d
       WHERE d.config_id = v_cfg.id;
    END IF;
  END IF;

  -- 5) Ficha passa a refletir o vínculo vigente (o anterior ficou no histórico).
  UPDATE public.dp_colaboradores
     SET ativo = true,
         data_desligamento = NULL,
         motivo_desligamento = NULL,
         desligado_em = NULL,
         desligado_por = NULL,
         data_admissao = p_data_admissao,
         matricula = COALESCE(NULLIF(p_matricula, ''), matricula),
         regime = COALESCE(NULLIF(p_regime, '')::public.dp_regime_trabalho, regime),
         forma_pagamento = COALESCE(NULLIF(p_forma_pagamento, '')::public.dp_forma_pagamento, forma_pagamento),
         cargo_id = COALESCE(p_cargo_id, cargo_id),
         unidade_id = COALESCE(p_unidade_id, unidade_id),
         setor_id = COALESCE(p_setor_id, setor_id),
         salario_base = COALESCE(p_salario_base, salario_base),
         valor_hora = COALESCE(p_valor_hora, valor_hora),
         updated_at = now()
   WHERE id = p_colaborador_id;

  RETURN v_historico_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.dp_recontratar_colaborador(uuid, date, text, text, uuid, uuid, uuid, numeric, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_recontratar_colaborador(uuid, date, text, text, uuid, uuid, uuid, numeric, numeric, text, text) TO authenticated, service_role;