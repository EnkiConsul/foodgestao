ALTER TABLE public.dp_config_dp
  ALTER COLUMN ferias_aviso_antecedencia_dias SET DEFAULT 40;

CREATE OR REPLACE FUNCTION public.dp_ferias_config(
  _company_id uuid, _unidade_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE (
  aviso_antecedencia_dias smallint,
  adiantamento_13 text,
  fracionamento_max smallint,
  fracao_min_dias smallint,
  fracao_maior_dias smallint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT COALESCE(u.ferias_aviso_antecedencia_dias, e.ferias_aviso_antecedencia_dias, 40::smallint),
         COALESCE(u.ferias_adiantamento_13, e.ferias_adiantamento_13, 'legal'),
         COALESCE(u.ferias_fracionamento_max, e.ferias_fracionamento_max, 3::smallint),
         COALESCE(u.ferias_fracao_min_dias, e.ferias_fracao_min_dias, 5::smallint),
         COALESCE(u.ferias_fracao_maior_dias, e.ferias_fracao_maior_dias, 14::smallint)
  FROM (SELECT 1) x
  LEFT JOIN public.dp_config_dp e
    ON e.company_id = _company_id AND e.unidade_id IS NULL
  LEFT JOIN public.dp_config_dp u
    ON u.company_id = _company_id AND _unidade_id IS NOT NULL AND u.unidade_id = _unidade_id
  WHERE private.dp_pode_ler_empresa(_company_id)
$$;

-- a conferência da programação também passa a usar 40 dias como padrão
CREATE OR REPLACE FUNCTION public.dp_ferias_validar_programacao(
  _colaborador_id uuid,
  _periodo_id uuid,
  _data_inicio date,
  _data_fim date,
  _dias_abono integer DEFAULT 0,
  _justificativa text DEFAULT NULL,
  _ignorar_gozo_id uuid DEFAULT NULL,
  _modo text DEFAULT 'gestor'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_col record;
  v_periodo record;
  v_usados int;
  v_novos int;
  v_cfg record;
  v_d date;
  v_dow int;
  v_trabalha boolean;
  v_fracoes int;
  v_dias_novos int;
  v_maior int;
  v_desc record;
  v_tem_justificativa boolean := COALESCE(btrim(_justificativa), '') <> '';
BEGIN
  IF _data_inicio IS NULL OR _data_fim IS NULL OR _data_fim < _data_inicio THEN
    RAISE EXCEPTION 'FERIAS_DATAS_INVALIDAS';
  END IF;

  SELECT id, company_id, unidade_id INTO v_col
  FROM public.dp_colaboradores WHERE id = _colaborador_id;
  IF v_col.id IS NULL THEN
    RAISE EXCEPTION 'FERIAS_COLABORADOR_NAO_ENCONTRADO';
  END IF;

  PERFORM private.dp_ferias_fila(_colaborador_id, v_col.company_id, v_col.unidade_id);

  SELECT * INTO v_periodo FROM public.dp_ferias_periodos WHERE id = _periodo_id FOR UPDATE;
  IF v_periodo.id IS NULL OR v_periodo.colaborador_id <> _colaborador_id THEN
    RAISE EXCEPTION 'FERIAS_PERIODO_NAO_ENCONTRADO';
  END IF;
  IF v_periodo.requer_revisao THEN
    RAISE EXCEPTION 'FERIAS_PERIODO_EM_REVISAO';
  END IF;

  SELECT COALESCE(SUM(g.dias + g.dias_abono), 0) INTO v_usados
  FROM public.dp_ferias_gozos g
  WHERE g.periodo_id = _periodo_id
    AND g.status <> 'cancelado'
    AND (_ignorar_gozo_id IS NULL OR g.id <> _ignorar_gozo_id);

  v_novos := (_data_fim - _data_inicio + 1) + COALESCE(_dias_abono, 0);
  IF v_usados + v_novos > v_periodo.dias_direito THEN
    RAISE EXCEPTION 'FERIAS_SALDO_INSUFICIENTE';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.dp_ferias_gozos g
    WHERE g.colaborador_id = _colaborador_id
      AND g.status <> 'cancelado'
      AND (_ignorar_gozo_id IS NULL OR g.id <> _ignorar_gozo_id)
      AND daterange(g.data_inicio, g.data_fim, '[]') && daterange(_data_inicio, _data_fim, '[]')
  ) THEN
    RAISE EXCEPTION 'FERIAS_SOBREPOSICAO';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.dp_convocacoes cv
    JOIN public.dp_convocacao_ocorrencias oc ON oc.id = cv.ocorrencia_id
    WHERE cv.colaborador_id = _colaborador_id
      AND cv.status = 'aceita'
      AND oc.data BETWEEN _data_inicio AND _data_fim
  ) THEN
    RAISE EXCEPTION 'FERIAS_CONVOCACAO_ACEITA';
  END IF;

  PERFORM private.dp_ferias_regras_check(
    _colaborador_id, v_col.company_id, _data_inicio, _data_fim, _ignorar_gozo_id);

  SELECT * INTO v_cfg FROM public.dp_ferias_config(v_col.company_id, v_col.unidade_id);

  SELECT COUNT(*)::int INTO v_fracoes
  FROM public.dp_ferias_gozos g
  WHERE g.periodo_id = _periodo_id
    AND g.status <> 'cancelado'
    AND (_ignorar_gozo_id IS NULL OR g.id <> _ignorar_gozo_id);

  v_dias_novos := (_data_fim - _data_inicio + 1);

  IF v_fracoes > 0 THEN
    IF v_fracoes + 1 > COALESCE(v_cfg.fracionamento_max, 3) THEN
      RAISE EXCEPTION 'FERIAS_FRACIONAMENTO_LIMITE';
    END IF;

    IF v_dias_novos < COALESCE(v_cfg.fracao_min_dias, 5) THEN
      RAISE EXCEPTION 'FERIAS_FRACAO_CURTA';
    END IF;

    SELECT COALESCE(MAX(g.dias), 0) INTO v_maior
    FROM public.dp_ferias_gozos g
    WHERE g.periodo_id = _periodo_id
      AND g.status <> 'cancelado'
      AND (_ignorar_gozo_id IS NULL OR g.id <> _ignorar_gozo_id);

    IF v_usados + v_novos >= v_periodo.dias_direito
       AND GREATEST(v_maior, v_dias_novos) < COALESCE(v_cfg.fracao_maior_dias, 14) THEN
      RAISE EXCEPTION 'FERIAS_FRACAO_MAIOR_AUSENTE';
    END IF;
  ELSIF v_dias_novos < COALESCE(v_cfg.fracao_min_dias, 5)
        AND v_novos < v_periodo.dias_direito THEN
    RAISE EXCEPTION 'FERIAS_FRACAO_CURTA';
  END IF;

  FOR v_d IN SELECT generate_series(_data_inicio + 1, _data_inicio + 2, INTERVAL '1 day')::date LOOP
    IF v_col.unidade_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.dp_feriados_resolver(v_col.unidade_id, v_d, v_d)
    ) THEN
      RAISE EXCEPTION 'FERIAS_INICIO_VESPERA';
    END IF;

    v_dow := EXTRACT(DOW FROM v_d)::int;
    SELECT cd.trabalha INTO v_trabalha
    FROM public.dp_colaborador_config_trabalho ct
    JOIN public.dp_colaborador_config_dias cd ON cd.config_id = ct.id
    WHERE ct.colaborador_id = _colaborador_id
      AND ct.vigencia_fim IS NULL
      AND cd.dow = v_dow
    LIMIT 1;

    IF v_trabalha IS FALSE OR (v_trabalha IS NULL AND v_dow = 0) THEN
      RAISE EXCEPTION 'FERIAS_INICIO_VESPERA';
    END IF;
  END LOOP;

  IF NOT v_tem_justificativa THEN
    SELECT * INTO v_desc
    FROM private.dp_ferias_cobertura_descoberta(
      _colaborador_id, v_col.company_id, _data_inicio, _data_fim, _ignorar_gozo_id)
    LIMIT 1;

    IF v_desc.data IS NOT NULL THEN
      RAISE EXCEPTION 'FERIAS_COBERTURA_MINIMA:%', to_char(v_desc.data, 'DD/MM/YYYY');
    END IF;
  END IF;

  IF _modo <> 'pedido'
     AND (_data_inicio - CURRENT_DATE) < COALESCE(v_cfg.aviso_antecedencia_dias, 40)
     AND NOT v_tem_justificativa THEN
    RAISE EXCEPTION 'FERIAS_AVISO_ANTECEDENCIA';
  END IF;
END;
$$;
