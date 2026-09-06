-- 1) Férias em curso / conflitos -------------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_ferias_em_curso(_colaborador_id uuid, _data date)
RETURNS TABLE (gozo_id uuid, data_inicio date, data_fim date)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT g.id, g.data_inicio, g.data_fim
  FROM public.dp_ferias_gozos g
  WHERE g.colaborador_id = _colaborador_id
    AND g.status IN ('aprovado', 'em_gozo', 'concluido')
    AND _data BETWEEN g.data_inicio AND g.data_fim
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.dp_ferias_em_curso(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_ferias_em_curso(uuid, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.dp_ferias_periodo_conflitos(_colaborador_id uuid, _inicio date, _fim date)
RETURNS TABLE (origem text, data date, detalhe text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'folga'::text, f.data, COALESCE(f.tipo::text, 'folga')
  FROM public.dp_folgas f
  WHERE f.colaborador_id = _colaborador_id
    AND f.data BETWEEN _inicio AND _fim
    AND f.status::text <> 'cancelada'
  UNION ALL
  SELECT 'convocacao'::text, cv.data, cv.status::text
  FROM public.dp_convocacoes cv
  WHERE cv.colaborador_id = _colaborador_id
    AND cv.data BETWEEN _inicio AND _fim
    AND cv.status::text IN ('pendente', 'aceita')
  UNION ALL
  SELECT 'escala'::text, ei.data, ei.tipo::text
  FROM public.dp_escala_itens ei
  WHERE ei.colaborador_id = _colaborador_id
    AND ei.data BETWEEN _inicio AND _fim
    AND ei.tipo::text NOT IN ('folga', 'ferias')
  ORDER BY 2
$$;

REVOKE ALL ON FUNCTION public.dp_ferias_periodo_conflitos(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_ferias_periodo_conflitos(uuid, date, date) TO authenticated, service_role;

-- 2) Triggers fail-closed: nada de trabalho durante as férias ---------------------
CREATE OR REPLACE FUNCTION public.dp_bloquear_durante_ferias()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_ferias record;
BEGIN
  -- itens de escala marcados como férias/afastamento são o próprio registro do período
  IF TG_TABLE_NAME = 'dp_escala_itens' AND NEW.tipo::text IN ('ferias', 'afastamento') THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'dp_folgas' AND NEW.status::text = 'cancelada' THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'dp_convocacoes' AND NEW.status::text NOT IN ('pendente', 'aceita') THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_ferias
  FROM public.dp_ferias_em_curso(NEW.colaborador_id, NEW.data);

  IF v_ferias.gozo_id IS NOT NULL THEN
    RAISE EXCEPTION 'FERIAS_COLABORADOR_EM_FERIAS:%:%',
      to_char(v_ferias.data_inicio, 'DD/MM/YYYY'), to_char(v_ferias.data_fim, 'DD/MM/YYYY');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dp_folgas_bloquear_ferias_trg ON public.dp_folgas;
CREATE TRIGGER dp_folgas_bloquear_ferias_trg
BEFORE INSERT OR UPDATE OF data, colaborador_id, status ON public.dp_folgas
FOR EACH ROW EXECUTE FUNCTION public.dp_bloquear_durante_ferias();

DROP TRIGGER IF EXISTS dp_convocacoes_bloquear_ferias_trg ON public.dp_convocacoes;
CREATE TRIGGER dp_convocacoes_bloquear_ferias_trg
BEFORE INSERT ON public.dp_convocacoes
FOR EACH ROW EXECUTE FUNCTION public.dp_bloquear_durante_ferias();

DROP TRIGGER IF EXISTS dp_escala_itens_bloquear_ferias_trg ON public.dp_escala_itens;
CREATE TRIGGER dp_escala_itens_bloquear_ferias_trg
BEFORE INSERT OR UPDATE OF data, colaborador_id, tipo ON public.dp_escala_itens
FOR EACH ROW EXECUTE FUNCTION public.dp_bloquear_durante_ferias();

-- 3) Avaliação de candidato marca EM_FERIAS --------------------------------------
CREATE OR REPLACE FUNCTION public.dp_convocacao_avaliar_candidato(_colaborador_id uuid, _ocorrencia_id uuid, _ignorar_convocacao_id uuid DEFAULT NULL::uuid, _pendente_bloqueia boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_o public.dp_convocacao_ocorrencias;
  v_c record;
  v_jornada jsonb;
  v_entrada time;
  v_saida time;
  v_intervalo integer;
  v_vira boolean;
  v_n_ini integer;
  v_n_fim integer;
  v_o_ini integer;
  v_o_fim integer;
  v_carga numeric;
  v_rem jsonb;
BEGIN
  SELECT * INTO v_o FROM public.dp_convocacao_ocorrencias WHERE id = _ocorrencia_id;
  IF v_o IS NULL THEN
    RETURN jsonb_build_object('apto', false, 'motivo', 'OCORRENCIA_INEXISTENTE');
  END IF;

  SELECT id, company_id, unidade_id, cargo_id, ativo, regime
    INTO v_c
    FROM public.dp_colaboradores
   WHERE id = _colaborador_id;

  IF v_c IS NULL OR v_c.company_id <> v_o.company_id THEN
    RETURN jsonb_build_object('apto', false, 'motivo', 'COLABORADOR_FORA_DA_EMPRESA');
  END IF;
  IF v_c.ativo IS FALSE THEN
    RETURN jsonb_build_object('apto', false, 'motivo', 'COLABORADOR_INATIVO');
  END IF;
  IF NOT public.dp_regime_convocavel(v_c.regime) THEN
    RETURN jsonb_build_object('apto', false, 'motivo', 'REGIME_NAO_CONVOCAVEL');
  END IF;
  IF v_c.cargo_id IS DISTINCT FROM v_o.cargo_id THEN
    RETURN jsonb_build_object('apto', false, 'motivo', 'CARGO_DIFERENTE');
  END IF;
  IF v_o.unidade_id IS NULL OR v_c.unidade_id IS NULL OR v_c.unidade_id <> v_o.unidade_id THEN
    RETURN jsonb_build_object('apto', false, 'motivo', 'OUTRA_UNIDADE');
  END IF;

  IF EXISTS (SELECT 1 FROM public.dp_ferias_em_curso(_colaborador_id, v_o.data)) THEN
    RETURN jsonb_build_object('apto', false, 'motivo', 'EM_FERIAS');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.dp_indisponibilidades i
     WHERE i.colaborador_id = _colaborador_id
       AND i.data = v_o.data
       AND i.cancelada_em IS NULL
  ) THEN
    RETURN jsonb_build_object('apto', false, 'motivo', 'INDISPONIVEL_NA_DATA');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.dp_convocacoes cv
     WHERE cv.company_id = v_o.company_id
       AND cv.colaborador_id = _colaborador_id
       AND cv.data = v_o.data
       AND (_ignorar_convocacao_id IS NULL OR cv.id <> _ignorar_convocacao_id)
       AND (
         cv.status IN ('aceita', 'encerrada_operacionalmente')
         OR cv.comparecimento IS NOT NULL
         OR (_pendente_bloqueia AND cv.status = 'pendente')
       )
  ) THEN
    RETURN jsonb_build_object('apto', false, 'motivo', 'JA_CONVOCADO_NA_DATA');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.dp_escala_itens ei
     WHERE ei.colaborador_id = _colaborador_id
       AND ei.data = v_o.data
       AND ei.tipo::text <> 'folga'
  ) THEN
    RETURN jsonb_build_object('apto', false, 'motivo', 'ALOCADO_EM_ESCALA');
  END IF;

  IF v_o.horario_modo = 'horario_unico' THEN
    v_entrada := v_o.entrada;
    v_saida := v_o.saida;
    v_intervalo := COALESCE(v_o.intervalo_minutos, 0);
    v_vira := COALESCE(v_o.termina_no_dia_seguinte, false);
  ELSE
    v_jornada := public.dp_convocacao_jornada_na_data(_colaborador_id, v_o.data);
    IF v_jornada IS NULL THEN
      RETURN jsonb_build_object('apto', false, 'motivo', 'SEM_JORNADA_NA_DATA');
    END IF;
    v_entrada := (v_jornada->>'entrada')::time;
    v_saida := (v_jornada->>'saida')::time;
    v_intervalo := COALESCE((v_jornada->>'intervalo_minutos')::int, 0);
    v_vira := COALESCE((v_jornada->>'termina_no_dia_seguinte')::boolean, false);
  END IF;

  IF v_entrada IS NULL OR v_saida IS NULL THEN
    RETURN jsonb_build_object('apto', false, 'motivo', 'HORARIO_INDEFINIDO');
  END IF;

  v_n_ini := EXTRACT(HOUR FROM v_o.necessidade_entrada)::int * 60 + EXTRACT(MINUTE FROM v_o.necessidade_entrada)::int;
  v_n_fim := EXTRACT(HOUR FROM v_o.necessidade_saida)::int * 60 + EXTRACT(MINUTE FROM v_o.necessidade_saida)::int;
  IF COALESCE(v_o.necessidade_termina_no_dia_seguinte, false) OR v_n_fim <= v_n_ini THEN
    v_n_fim := v_n_fim + 1440;
  END IF;

  v_o_ini := EXTRACT(HOUR FROM v_entrada)::int * 60 + EXTRACT(MINUTE FROM v_entrada)::int;
  v_o_fim := EXTRACT(HOUR FROM v_saida)::int * 60 + EXTRACT(MINUTE FROM v_saida)::int;
  IF v_vira OR v_o_fim <= v_o_ini THEN
    v_o_fim := v_o_fim + 1440;
    v_vira := true;
  END IF;

  IF NOT (v_o_ini <= v_n_ini AND v_o_fim >= v_n_fim) THEN
    RETURN jsonb_build_object('apto', false, 'motivo', 'COMPATIBILIDADE_INCOMPATIVEL');
  END IF;

  v_carga := round(((v_o_fim - v_o_ini) - GREATEST(v_intervalo, 0))::numeric / 60.0, 2);
  IF v_carga <= 0 THEN
    RETURN jsonb_build_object('apto', false, 'motivo', 'CARGA_INVALIDA');
  END IF;

  v_rem := public.dp_convocacao_remuneracao_snapshot(_colaborador_id, v_carga);
  IF (v_rem->>'elegivel')::boolean IS NOT TRUE THEN
    RETURN jsonb_build_object('apto', false, 'motivo', v_rem->>'motivo');
  END IF;

  RETURN jsonb_build_object(
    'apto', true,
    'motivo', NULL,
    'entrada', v_entrada,
    'saida', v_saida,
    'intervalo_minutos', v_intervalo,
    'termina_no_dia_seguinte', v_vira,
    'carga_prevista_horas', v_carga,
    'compatibilidade', 'integral',
    'regime_snapshot', v_c.regime::text,
    'remuneracao_snapshot', v_rem - 'elegivel');
END;
$function$;

-- 4) Regras de fracionamento -----------------------------------------------------
ALTER TABLE public.dp_config_dp
  ADD COLUMN IF NOT EXISTS ferias_fracionamento_max smallint,
  ADD COLUMN IF NOT EXISTS ferias_fracao_min_dias smallint,
  ADD COLUMN IF NOT EXISTS ferias_fracao_maior_dias smallint;

ALTER TABLE public.dp_config_dp DROP CONSTRAINT IF EXISTS ck_dp_config_ferias_fracionamento;
ALTER TABLE public.dp_config_dp
  ADD CONSTRAINT ck_dp_config_ferias_fracionamento CHECK (
    (ferias_fracionamento_max IS NULL OR ferias_fracionamento_max BETWEEN 1 AND 3)
    AND (ferias_fracao_min_dias IS NULL OR ferias_fracao_min_dias BETWEEN 1 AND 30)
    AND (ferias_fracao_maior_dias IS NULL OR ferias_fracao_maior_dias BETWEEN 1 AND 30)
  );

DROP FUNCTION IF EXISTS public.dp_ferias_config(uuid, uuid);
CREATE OR REPLACE FUNCTION public.dp_ferias_config(_company_id uuid, _unidade_id uuid DEFAULT NULL)
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
SET search_path = public
AS $$
  SELECT COALESCE(u.ferias_aviso_antecedencia_dias, e.ferias_aviso_antecedencia_dias, 60::smallint),
         COALESCE(u.ferias_adiantamento_13, e.ferias_adiantamento_13, 'legal'),
         COALESCE(u.ferias_fracionamento_max, e.ferias_fracionamento_max, 3::smallint),
         COALESCE(u.ferias_fracao_min_dias, e.ferias_fracao_min_dias, 5::smallint),
         COALESCE(u.ferias_fracao_maior_dias, e.ferias_fracao_maior_dias, 14::smallint)
  FROM (SELECT 1) x
  LEFT JOIN public.dp_config_dp e
    ON e.company_id = _company_id AND e.unidade_id IS NULL
  LEFT JOIN public.dp_config_dp u
    ON u.company_id = _company_id AND _unidade_id IS NOT NULL AND u.unidade_id = _unidade_id
$$;

REVOKE ALL ON FUNCTION public.dp_ferias_config(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_ferias_config(uuid, uuid) TO authenticated, service_role;

-- 5) Validação da programação com fracionamento ----------------------------------
CREATE OR REPLACE FUNCTION public.dp_ferias_validar_programacao(_colaborador_id uuid, _periodo_id uuid, _data_inicio date, _data_fim date, _dias_abono integer, _justificativa text, _ignorar_gozo_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
BEGIN
  IF _data_inicio IS NULL OR _data_fim IS NULL OR _data_fim < _data_inicio THEN
    RAISE EXCEPTION 'FERIAS_DATAS_INVALIDAS';
  END IF;

  SELECT id, company_id, unidade_id INTO v_col
  FROM public.dp_colaboradores WHERE id = _colaborador_id;
  IF v_col.id IS NULL THEN
    RAISE EXCEPTION 'FERIAS_COLABORADOR_NAO_ENCONTRADO';
  END IF;

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

  SELECT * INTO v_cfg FROM public.dp_ferias_config(v_col.company_id, v_col.unidade_id);

  -- Fracionamento: conta as parcelas já marcadas neste período aquisitivo
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

    -- quando o saldo acabar, alguma parcela precisa alcançar o mínimo do maior período
    IF v_usados + v_novos >= v_periodo.dias_direito
       AND GREATEST(v_maior, v_dias_novos) < COALESCE(v_cfg.fracao_maior_dias, 14) THEN
      RAISE EXCEPTION 'FERIAS_FRACAO_MAIOR_AUSENTE';
    END IF;
  ELSIF v_dias_novos < COALESCE(v_cfg.fracao_min_dias, 5)
        AND v_novos < v_periodo.dias_direito THEN
    RAISE EXCEPTION 'FERIAS_FRACAO_CURTA';
  END IF;

  -- Início não pode cair nos dois dias que antecedem feriado ou descanso semanal
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

  IF (_data_inicio - CURRENT_DATE) < COALESCE(v_cfg.aviso_antecedencia_dias, 60)
     AND COALESCE(btrim(_justificativa), '') = '' THEN
    RAISE EXCEPTION 'FERIAS_AVISO_ANTECEDENCIA';
  END IF;
END;
$function$;

-- 6) Sugestão de cobertura durante as férias -------------------------------------
CREATE OR REPLACE FUNCTION public.dp_ferias_cobertura_sugestao(_gozo_id uuid)
RETURNS TABLE (
  data date,
  cargo_id uuid,
  turno_id uuid,
  minimo integer,
  previstos integer,
  faltam integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gozo record;
  v_col record;
BEGIN
  SELECT * INTO v_gozo FROM public.dp_ferias_gozos WHERE id = _gozo_id;
  IF v_gozo.id IS NULL THEN RAISE EXCEPTION 'FERIAS_NAO_ENCONTRADA'; END IF;
  IF NOT (private.is_company_member(auth.uid(), v_gozo.company_id)
          OR private.is_company_owner(auth.uid(), v_gozo.company_id)) THEN
    RAISE EXCEPTION 'FERIAS_SEM_PERMISSAO';
  END IF;

  SELECT c.id, c.unidade_id, c.cargo_id INTO v_col
  FROM public.dp_colaboradores c WHERE c.id = v_gozo.colaborador_id;

  RETURN QUERY
  WITH dias AS (
    SELECT d::date AS data
    FROM generate_series(v_gozo.data_inicio, v_gozo.data_fim, INTERVAL '1 day') d
  ),
  regras AS (
    SELECT r.cargo_id, r.turno_id, r.dia_semana, r.minimo
    FROM public.dp_cobertura_minima r
    WHERE r.company_id = v_gozo.company_id
      AND COALESCE(r.ativo, true)
      AND (r.unidade_id IS NULL OR r.unidade_id = v_col.unidade_id)
      AND (r.cargo_id IS NULL OR r.cargo_id = v_col.cargo_id)
  )
  SELECT dias.data,
         regras.cargo_id,
         regras.turno_id,
         regras.minimo,
         COALESCE(prev.qtd, 0)::int,
         GREATEST(regras.minimo - COALESCE(prev.qtd, 0), 0)::int
  FROM dias
  JOIN regras ON regras.dia_semana IS NULL OR regras.dia_semana = EXTRACT(DOW FROM dias.data)::int
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS qtd
    FROM public.dp_escala_itens ei
    JOIN public.dp_colaboradores c2 ON c2.id = ei.colaborador_id
    WHERE ei.data = dias.data
      AND ei.company_id = v_gozo.company_id
      AND ei.tipo::text = 'trabalho'
      AND ei.colaborador_id <> v_gozo.colaborador_id
      AND (regras.cargo_id IS NULL OR c2.cargo_id = regras.cargo_id)
      AND (regras.turno_id IS NULL OR ei.turno_id = regras.turno_id)
  ) prev ON true
  WHERE COALESCE(prev.qtd, 0) < regras.minimo
  ORDER BY 1;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_ferias_cobertura_sugestao(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_ferias_cobertura_sugestao(uuid) TO authenticated, service_role;