-- =====================================================================
-- M16 — Convocações · helpers de backend para a publicação
-- Rollback documentado:
--   DROP INDEX IF EXISTS public.uq_dp_convocacoes_oferta_ocorrencia;
--   DROP FUNCTION IF EXISTS public.dp_convocacao_avaliar_candidato(uuid, uuid);
--   DROP FUNCTION IF EXISTS public.dp_convocacao_remuneracao_snapshot(uuid, numeric);
--   DROP FUNCTION IF EXISTS public.dp_convocacao_jornada_na_data(uuid, date);
--   DROP FUNCTION IF EXISTS public.dp_convocacao_timezone(uuid, uuid);
-- =====================================================================

-- Idempotência das ofertas do novo fluxo: 1 oferta por ocorrência/pessoa.
CREATE UNIQUE INDEX IF NOT EXISTS uq_dp_convocacoes_oferta_ocorrencia
  ON public.dp_convocacoes (ocorrencia_id, colaborador_id)
  WHERE ocorrencia_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- Timezone autoritativo: unidade → empresa. Fail closed.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_convocacao_timezone(
  _company_id uuid,
  _unidade_id uuid DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz text;
BEGIN
  IF _unidade_id IS NOT NULL THEN
    SELECT NULLIF(btrim(u.timezone), '') INTO v_tz
      FROM public.dp_unidades u
     WHERE u.id = _unidade_id AND u.company_id = _company_id;
  END IF;

  IF v_tz IS NULL THEN
    SELECT NULLIF(btrim(c.timezone), '') INTO v_tz
      FROM public.companies c
     WHERE c.id = _company_id;
  END IF;

  IF v_tz IS NULL THEN
    RAISE EXCEPTION 'TIMEZONE_NAO_CONFIGURADO' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = v_tz) THEN
    RAISE EXCEPTION 'TIMEZONE_INVALIDO: %', v_tz USING ERRCODE = '22023';
  END IF;

  RETURN v_tz;
END;
$$;

-- ---------------------------------------------------------------------
-- Jornada vigente do trabalhador na data (modo jornada_individual).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_convocacao_jornada_na_data(
  _colaborador_id uuid,
  _data date
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dia record;
BEGIN
  SELECT d.entrada, d.saida, COALESCE(d.intervalo_minutos, 0) AS intervalo_minutos, d.trabalha
    INTO v_dia
    FROM public.dp_colaborador_config_trabalho ct
    JOIN public.dp_colaborador_config_dias d ON d.config_id = ct.id AND d.company_id = ct.company_id
   WHERE ct.colaborador_id = _colaborador_id
     AND (ct.vigencia_inicio IS NULL OR ct.vigencia_inicio <= _data)
     AND (ct.vigencia_fim IS NULL OR ct.vigencia_fim >= _data)
     AND d.dow = EXTRACT(DOW FROM _data)::int
   ORDER BY ct.vigencia_inicio DESC NULLS LAST
   LIMIT 1;

  IF v_dia IS NULL OR v_dia.trabalha IS FALSE OR v_dia.entrada IS NULL OR v_dia.saida IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'entrada', v_dia.entrada,
    'saida', v_dia.saida,
    'intervalo_minutos', v_dia.intervalo_minutos,
    'termina_no_dia_seguinte', (v_dia.saida <= v_dia.entrada));
END;
$$;

-- ---------------------------------------------------------------------
-- Remuneração V1: nunca converte salário mensal, nunca usa piso do cargo.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_convocacao_remuneracao_snapshot(
  _colaborador_id uuid,
  _carga_prevista_horas numeric
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c record;
  v_forma text;
  v_unidade text;
  v_valor numeric;
  v_qtd numeric;
BEGIN
  SELECT regime, forma_pagamento, valor_hora, valor_diaria
    INTO v_c
    FROM public.dp_colaboradores
   WHERE id = _colaborador_id;

  IF v_c IS NULL THEN
    RETURN jsonb_build_object('elegivel', false, 'motivo', 'COLABORADOR_INEXISTENTE');
  END IF;

  IF NOT public.dp_regime_convocavel(v_c.regime) THEN
    RETURN jsonb_build_object('elegivel', false, 'motivo', 'REGIME_NAO_CONVOCAVEL');
  END IF;

  v_forma := v_c.forma_pagamento::text;

  IF v_forma = 'diarista' THEN
    v_unidade := 'diaria';
    v_valor := COALESCE(v_c.valor_diaria, 0);
    v_qtd := 1;
  ELSIF v_forma = 'horista' OR v_c.regime::text = 'intermitente' THEN
    v_unidade := 'hora';
    v_valor := COALESCE(v_c.valor_hora, 0);
    v_qtd := COALESCE(_carga_prevista_horas, 0);
  ELSE
    RETURN jsonb_build_object('elegivel', false, 'motivo', 'REMUNERACAO_MENSALISTA_NAO_ELEGIVEL');
  END IF;

  IF v_valor <= 0 THEN
    RETURN jsonb_build_object('elegivel', false, 'motivo',
      CASE WHEN v_unidade = 'diaria' THEN 'VALOR_DIARIA_AUSENTE' ELSE 'VALOR_HORA_AUSENTE' END);
  END IF;

  IF v_qtd <= 0 THEN
    RETURN jsonb_build_object('elegivel', false, 'motivo', 'QUANTIDADE_PREVISTA_INVALIDA');
  END IF;

  RETURN jsonb_build_object(
    'elegivel', true,
    'forma_pagamento', COALESCE(v_forma, CASE WHEN v_unidade = 'hora' THEN 'horista' ELSE 'diarista' END),
    'unidade_remuneracao', v_unidade,
    'valor_unitario', round(v_valor, 2),
    'quantidade_prevista', round(v_qtd, 2),
    'valor_previsto', round(v_valor * v_qtd, 2),
    'fonte', 'cadastro_colaborador');
END;
$$;

-- ---------------------------------------------------------------------
-- Avaliação autoritativa de um candidato para uma ocorrência.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_convocacao_avaliar_candidato(
  _colaborador_id uuid,
  _ocorrencia_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
  IF v_c.unidade_id IS NOT NULL AND v_c.unidade_id <> v_o.unidade_id THEN
    RETURN jsonb_build_object('apto', false, 'motivo', 'OUTRA_UNIDADE');
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
     WHERE cv.colaborador_id = _colaborador_id
       AND cv.data = v_o.data
       AND cv.status IN ('pendente','aceita')
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

  -- janelas em minutos a partir da meia-noite da data da ocorrência
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
$$;

-- Helpers internos: nunca expostos a authenticated/anon.
REVOKE ALL ON FUNCTION public.dp_convocacao_timezone(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_convocacao_timezone(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.dp_convocacao_timezone(uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.dp_convocacao_jornada_na_data(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_convocacao_jornada_na_data(uuid, date) FROM anon;
REVOKE ALL ON FUNCTION public.dp_convocacao_jornada_na_data(uuid, date) FROM authenticated;
REVOKE ALL ON FUNCTION public.dp_convocacao_remuneracao_snapshot(uuid, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_convocacao_remuneracao_snapshot(uuid, numeric) FROM anon;
REVOKE ALL ON FUNCTION public.dp_convocacao_remuneracao_snapshot(uuid, numeric) FROM authenticated;
REVOKE ALL ON FUNCTION public.dp_convocacao_avaliar_candidato(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_convocacao_avaliar_candidato(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.dp_convocacao_avaliar_candidato(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_timezone(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_jornada_na_data(uuid, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_remuneracao_snapshot(uuid, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_avaliar_candidato(uuid, uuid) TO service_role;