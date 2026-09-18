-- Restore the publication contract while retaining the newer remuneration key.
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

  -- Mesmo dia é permitido; horário sobreposto não.
  IF public.dp_colaborador_horario_ocupado(
       _colaborador_id, v_o.data,
       v_o.necessidade_entrada, v_o.necessidade_saida,
       COALESCE(v_o.necessidade_termina_no_dia_seguinte, false),
       _ignorar_convocacao_id, false) THEN
    RETURN jsonb_build_object('apto', false, 'motivo', 'JA_CONVOCADO_NO_HORARIO');
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

  v_n_ini := public.dp_minutos_do_horario(v_o.necessidade_entrada);
  v_n_fim := public.dp_minutos_do_horario(v_o.necessidade_saida);
  IF COALESCE(v_o.necessidade_termina_no_dia_seguinte, false) OR v_n_fim <= v_n_ini THEN
    v_n_fim := v_n_fim + 1440;
  END IF;

  v_o_ini := public.dp_minutos_do_horario(v_entrada);
  v_o_fim := public.dp_minutos_do_horario(v_saida);
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
    'entrada', v_entrada,
    'saida', v_saida,
    'intervalo_minutos', GREATEST(COALESCE(v_intervalo, 0), 0),
    'termina_no_dia_seguinte', v_vira,
    'carga_prevista_horas', v_carga,
    'remuneracao', v_rem,
    'compatibilidade', 'integral',
    'regime_snapshot', v_c.regime::text,
    'remuneracao_snapshot', v_rem - 'elegivel'
  );
END;
$function$;

-- Keep this helper internal after CREATE OR REPLACE.
REVOKE EXECUTE ON FUNCTION public.dp_convocacao_avaliar_candidato(uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_avaliar_candidato(uuid,uuid,uuid,boolean) TO service_role;
