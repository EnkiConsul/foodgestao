-- Partial approval is an existing workflow; admit its documented compatibility value.
ALTER TABLE public.dp_convocacoes DROP CONSTRAINT dp_convocacoes_compatibilidade_check;
ALTER TABLE public.dp_convocacoes ADD CONSTRAINT dp_convocacoes_compatibilidade_check
 CHECK (compatibilidade IS NULL OR compatibilidade IN ('integral','incompativel','parcial'));
CREATE OR REPLACE FUNCTION public.dp_convocacao_decidir_parcial(p_convocacao_id uuid, p_acao text, p_motivo text DEFAULT NULL::text, p_prazo timestamp with time zone DEFAULT NULL::timestamp with time zone, p_colaborador_ids uuid[] DEFAULT NULL::uuid[], p_confirmado boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid;
  v_conv record;
  v_ocor record;
  v_agora timestamptz := now();
  v_acao text := upper(btrim(COALESCE(p_acao, '')));
  v_motivo text := NULLIF(btrim(COALESCE(p_motivo, '')), '');
  v_aval jsonb;
  v_aptos jsonb;
  v_item jsonb;
  v_criadas int := 0;
  v_prazo timestamptz;
  v_snap jsonb;
  v_quantidade numeric;
  v_inicio timestamptz;
  v_fim timestamptz;
  v_intervalo integer;
  v_duracao integer;
BEGIN
  IF p_convocacao_id IS NULL OR v_acao NOT IN ('APROVAR', 'RECUSAR', 'REOFERTAR') THEN
    RAISE EXCEPTION 'INVALID_INPUT: ação inválida.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_conv FROM public.dp_convocacoes WHERE id = p_convocacao_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: convocação inexistente.' USING ERRCODE = '23503';
  END IF;
  v_uid := public.dp_convocacao_exige_admin(v_conv.company_id);

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_conv.colaborador_id::text || '|' || v_conv.data::text, 0));

  SELECT * INTO v_conv FROM public.dp_convocacoes WHERE id = p_convocacao_id FOR UPDATE;

  IF v_conv.parcial_status IS DISTINCT FROM 'aguardando_gestor' OR v_conv.status <> 'pendente' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'INVALID_STATE',
      'parcial_status', v_conv.parcial_status, 'status', v_conv.status::text);
  END IF;

  SELECT * INTO v_ocor
    FROM public.dp_convocacao_ocorrencias
   WHERE id = v_conv.ocorrencia_id AND company_id = v_conv.company_id
   FOR UPDATE;

  IF v_conv.inicio_previsto IS NOT NULL AND v_conv.inicio_previsto <= v_agora THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'OCCURRENCE_ALREADY_STARTED');
  END IF;

  v_aval := public.dp_convocacao_avaliar_parcial(p_convocacao_id);
  v_aptos := COALESCE(v_aval->'aptos', '[]'::jsonb);

  IF v_acao = 'APROVAR' THEN
    -- Preserve the unit rate agreed at publication; do not use today's employee rate.
    v_snap := v_conv.remuneracao_snapshot;
    IF v_snap IS NULL OR COALESCE(v_snap->>'unidade_remuneracao','') NOT IN ('hora','diaria')
       OR COALESCE((v_snap->>'valor_unitario')::numeric,0) <= 0 THEN
      RAISE EXCEPTION 'INVALID_REMUNERATION_SNAPSHOT: revise a remuneração da oferta antes de aprovar.'
        USING ERRCODE = '22023';
    END IF;
    v_quantidade := CASE WHEN v_snap->>'unidade_remuneracao' = 'hora'
                        THEN v_conv.parcial_carga_horas ELSE 1 END;
    v_snap := v_snap || jsonb_build_object(
      'quantidade_prevista', round(v_quantidade,2),
      'valor_previsto', round((v_snap->>'valor_unitario')::numeric * v_quantidade,2));
    v_inicio := ((v_conv.data + v_conv.parcial_entrada) AT TIME ZONE
                 COALESCE(v_conv.timezone_snapshot,'America/Sao_Paulo'));
    v_fim := ((v_conv.data + CASE WHEN COALESCE(v_conv.parcial_termina_no_dia_seguinte,false) THEN 1 ELSE 0 END
              + v_conv.parcial_saida) AT TIME ZONE COALESCE(v_conv.timezone_snapshot,'America/Sao_Paulo'));
    v_duracao := public.dp_minutos_do_horario(v_conv.parcial_saida)
                 - public.dp_minutos_do_horario(v_conv.parcial_entrada)
                 + CASE WHEN COALESCE(v_conv.parcial_termina_no_dia_seguinte,false) THEN 1440 ELSE 0 END;
    v_intervalo := LEAST(GREATEST(COALESCE(v_conv.intervalo_minutos,0),0),GREATEST(v_duracao-1,0));
    UPDATE public.dp_convocacoes
       SET status = 'aceita',
           entrada = v_conv.parcial_entrada,
           saida = v_conv.parcial_saida,
           termina_no_dia_seguinte = COALESCE(v_conv.parcial_termina_no_dia_seguinte, false),
           carga_prevista_horas = v_conv.parcial_carga_horas,
           intervalo_minutos = v_intervalo,
           inicio_previsto = v_inicio,
           fim_previsto = v_fim,
           encerramento_operacional = v_fim,
           remuneracao_snapshot = v_snap,
           compatibilidade = 'parcial',
           parcial_status = 'aprovada',
           parcial_decidido_em = v_agora,
           parcial_decidido_por = v_uid,
           parcial_decisao_motivo = v_motivo,
           respondida_em = COALESCE(respondida_em, v_agora),
           updated_at = now()
     WHERE id = v_conv.id;

    UPDATE public.dp_convocacoes
       SET status = 'cancelada', encerrada_em = v_agora,
           encerramento_motivo = 'PARTIAL_APPROVED', updated_at = now()
     WHERE reoferta_de_convocacao_id = v_conv.id AND status = 'pendente';

    PERFORM public.dp_convocacao_log_evento(
      v_conv.company_id, v_ocor.grupo_id, v_conv.ocorrencia_id, 'oferta_parcial_aprovada',
      jsonb_build_object('convocacao_id', v_conv.id, 'colaborador_id', v_conv.colaborador_id,
        'entrada', v_conv.parcial_entrada, 'saida', v_conv.parcial_saida,
        'carga_prevista_horas', v_conv.parcial_carga_horas,
        'descoberto_inicio_minutos', v_aval->'descoberto_inicio_minutos',
        'descoberto_fim_minutos', v_aval->'descoberto_fim_minutos',
        'motivo', v_motivo));

    RETURN jsonb_build_object('ok', true, 'acao', 'APROVAR', 'convocacao_id', v_conv.id,
      'descoberto_inicio_minutos', v_aval->'descoberto_inicio_minutos',
      'descoberto_fim_minutos', v_aval->'descoberto_fim_minutos');
  END IF;

  IF v_acao = 'REOFERTAR' THEN
    IF jsonb_array_length(v_aptos) = 0 THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'NO_ELIGIBLE', 'aptos', v_aptos);
    END IF;

    v_prazo := COALESCE(p_prazo, v_conv.inicio_previsto, (v_ocor.data + time '23:59')::timestamptz);
    IF v_prazo <= v_agora THEN
      v_prazo := v_agora + interval '2 hours';
    END IF;
    IF v_conv.inicio_previsto IS NOT NULL AND v_prazo > v_conv.inicio_previsto THEN
      v_prazo := v_conv.inicio_previsto;
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(v_aptos)
    LOOP
      CONTINUE WHEN p_colaborador_ids IS NOT NULL
        AND NOT ((v_item->>'colaborador_id')::uuid = ANY (p_colaborador_ids));

      v_snap := public.dp_convocacao_remuneracao_snapshot(
        (v_item->>'colaborador_id')::uuid, (v_item->>'carga_prevista_horas')::numeric);

      INSERT INTO public.dp_convocacoes (
        company_id, unidade_id, colaborador_id, turno_id, data,
        entrada, saida, intervalo_minutos, termina_no_dia_seguinte, carga_prevista_horas,
        status, prazo_resposta, prazo_resposta_base, ocorrencia_id, disponibilizada_em,
        inicio_previsto, fim_previsto, timezone_snapshot, compatibilidade,
        regime_snapshot, remuneracao_snapshot, origem_oferta, criada_por,
        reoferta_de_convocacao_id, nivel_prioridade
      )
      SELECT
        v_conv.company_id, v_conv.unidade_id, (v_item->>'colaborador_id')::uuid,
        v_conv.turno_id, v_conv.data,
        (v_item->>'entrada')::time, (v_item->>'saida')::time,
        COALESCE(v_conv.intervalo_minutos, 0),
        COALESCE((v_item->>'termina_no_dia_seguinte')::boolean, false),
        (v_item->>'carga_prevista_horas')::numeric,
        'pendente', v_prazo, v_prazo, v_conv.ocorrencia_id, v_agora,
        v_conv.inicio_previsto, v_conv.fim_previsto, v_conv.timezone_snapshot, 'integral',
        col.regime, v_snap - 'elegivel', 'reoferta_parcial', v_uid,
        v_conv.id, 1
      FROM public.dp_colaboradores col
     WHERE col.id = (v_item->>'colaborador_id')::uuid;

      v_criadas := v_criadas + 1;
    END LOOP;

    IF v_criadas = 0 THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'NO_ELIGIBLE', 'aptos', v_aptos);
    END IF;

    UPDATE public.dp_convocacoes
       SET parcial_reofertada_em = v_agora, parcial_reoferta_prazo = v_prazo, updated_at = now()
     WHERE id = v_conv.id;

    PERFORM public.dp_convocacao_log_evento(
      v_conv.company_id, v_ocor.grupo_id, v_conv.ocorrencia_id, 'oferta_parcial_reofertada',
      jsonb_build_object('convocacao_id', v_conv.id, 'ofertas_criadas', v_criadas,
        'prazo_resposta', v_prazo));

    RETURN jsonb_build_object('ok', true, 'acao', 'REOFERTAR', 'convocacao_id', v_conv.id,
      'ofertas_criadas', v_criadas, 'prazo_resposta', v_prazo);
  END IF;

  -- RECUSAR
  IF v_motivo IS NULL THEN
    RAISE EXCEPTION 'REFUSAL_REASON_REQUIRED: informe o motivo da recusa.' USING ERRCODE = '22023';
  END IF;

  IF p_confirmado IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false,
      'motivo', CASE WHEN jsonb_array_length(v_aptos) = 0 THEN 'NO_ELIGIBLE_CONFIRM' ELSE 'HAS_ELIGIBLE' END,
      'aptos', v_aptos,
      'reofertas_pendentes', v_aval->'reofertas_pendentes');
  END IF;

  UPDATE public.dp_convocacoes
     SET status = 'recusada', respondida_em = v_agora,
         motivo_recusa = v_motivo,
         parcial_status = 'recusada',
         parcial_decidido_em = v_agora, parcial_decidido_por = v_uid,
         parcial_decisao_motivo = v_motivo,
         updated_at = now()
   WHERE id = v_conv.id;

  PERFORM public.dp_convocacao_log_evento(
    v_conv.company_id, v_ocor.grupo_id, v_conv.ocorrencia_id, 'oferta_parcial_recusada',
    jsonb_build_object('convocacao_id', v_conv.id, 'colaborador_id', v_conv.colaborador_id,
      'motivo', v_motivo, 'tinha_aptos', jsonb_array_length(v_aptos) > 0));

  RETURN jsonb_build_object('ok', true, 'acao', 'RECUSAR', 'convocacao_id', v_conv.id);
END;
$function$;
