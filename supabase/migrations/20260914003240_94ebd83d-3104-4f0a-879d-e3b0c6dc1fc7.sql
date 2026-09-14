-- 1) Colunas do aceite atrasado
ALTER TABLE public.dp_convocacoes
  ADD COLUMN IF NOT EXISTS aceite_atrasado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS aceite_atraso_minutos integer,
  ADD COLUMN IF NOT EXISTS aceite_atraso_justificativa text,
  ADD COLUMN IF NOT EXISTS aceite_atraso_forma text;

ALTER TABLE public.dp_convocacoes
  DROP CONSTRAINT IF EXISTS dp_convocacoes_aceite_atraso_forma_chk;
ALTER TABLE public.dp_convocacoes
  ADD CONSTRAINT dp_convocacoes_aceite_atraso_forma_chk
  CHECK (aceite_atraso_forma IS NULL OR aceite_atraso_forma IN ('integral', 'chegada_tardia'));

-- 2) Convocações repetidas nos mesmos dias liberadas
DROP INDEX IF EXISTS public.uq_dp_conv_ocor_necessidade_vigente;

-- 3) Helpers de janela
CREATE OR REPLACE FUNCTION public.dp_minutos_do_horario(_t time)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE WHEN _t IS NULL THEN NULL
              ELSE EXTRACT(HOUR FROM _t)::int * 60 + EXTRACT(MINUTE FROM _t)::int END;
$$;

-- Já existe horário confirmado (ou parcial reservado) que se sobrepõe? Vale em qualquer unidade.
CREATE OR REPLACE FUNCTION public.dp_colaborador_horario_ocupado(
  _colaborador_id uuid,
  _data date,
  _entrada time,
  _saida time,
  _vira boolean DEFAULT false,
  _ignorar_convocacao_id uuid DEFAULT NULL,
  _pendente_bloqueia boolean DEFAULT false
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH alvo AS (
    SELECT public.dp_minutos_do_horario(_entrada) AS ini,
           CASE WHEN COALESCE(_vira, false)
                     OR public.dp_minutos_do_horario(_saida) <= public.dp_minutos_do_horario(_entrada)
                THEN public.dp_minutos_do_horario(_saida) + 1440
                ELSE public.dp_minutos_do_horario(_saida) END AS fim
  ),
  outras AS (
    SELECT (cv.data - _data) * 1440
             + public.dp_minutos_do_horario(COALESCE(cv.parcial_entrada, cv.entrada)) AS ini,
           (cv.data - _data) * 1440
             + CASE WHEN COALESCE(COALESCE(cv.parcial_termina_no_dia_seguinte, cv.termina_no_dia_seguinte), false)
                         OR public.dp_minutos_do_horario(COALESCE(cv.parcial_saida, cv.saida))
                            <= public.dp_minutos_do_horario(COALESCE(cv.parcial_entrada, cv.entrada))
                    THEN public.dp_minutos_do_horario(COALESCE(cv.parcial_saida, cv.saida)) + 1440
                    ELSE public.dp_minutos_do_horario(COALESCE(cv.parcial_saida, cv.saida)) END AS fim
      FROM public.dp_convocacoes cv
     WHERE cv.colaborador_id = _colaborador_id
       AND cv.data BETWEEN (_data - 1) AND (_data + 1)
       AND (_ignorar_convocacao_id IS NULL OR cv.id <> _ignorar_convocacao_id)
       AND cv.entrada IS NOT NULL AND cv.saida IS NOT NULL
       AND (
         cv.status IN ('aceita', 'encerrada_operacionalmente')
         OR cv.comparecimento IS NOT NULL
         OR COALESCE(cv.parcial_status, '') = 'aguardando_gestor'
         OR (_pendente_bloqueia AND cv.status = 'pendente')
       )
  )
  SELECT EXISTS (
    SELECT 1 FROM alvo a JOIN outras o ON o.ini < a.fim AND o.fim > a.ini
  );
$$;

GRANT EXECUTE ON FUNCTION public.dp_minutos_do_horario(time) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dp_colaborador_horario_ocupado(uuid, date, time, time, boolean, uuid, boolean)
  TO authenticated, service_role;

-- 4) Elegibilidade: bloqueio por horário sobreposto (não mais por dia inteiro)
CREATE OR REPLACE FUNCTION public.dp_convocacao_avaliar_candidato(
  _colaborador_id uuid, _ocorrencia_id uuid,
  _ignorar_convocacao_id uuid DEFAULT NULL, _pendente_bloqueia boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
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
    'remuneracao', v_rem
  );
END;
$function$;

-- 5) Resposta do colaborador: aceite depois do início, com justificativa
CREATE OR REPLACE FUNCTION public.dp_convocacao_responder_oferta(
  p_convocacao_id uuid,
  p_aceito boolean,
  p_motivo text DEFAULT NULL,
  p_parcial_entrada time DEFAULT NULL,
  p_parcial_saida time DEFAULT NULL,
  p_parcial_termina_no_dia_seguinte boolean DEFAULT NULL,
  p_parcial_observacao text DEFAULT NULL,
  p_atraso_justificativa text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_conv record;
  v_ocor record;
  v_colab uuid;
  v_agora timestamptz := now();
  v_aceitas int := 0;
  v_encerradas int := 0;
  v_alvo public.dp_convocacao_status;
  v_motivo text := NULLIF(btrim(COALESCE(p_motivo, '')), '');
  v_aval jsonb;
  v_enc text;
  v_enc_status public.dp_convocacao_status;
  v_enc_motivo text;
  v_enc_evento text;
  v_parcial boolean := (p_parcial_entrada IS NOT NULL OR p_parcial_saida IS NOT NULL);
  v_n_ini int; v_n_fim int; v_p_ini int; v_p_fim int;
  v_p_vira boolean;
  v_p_carga numeric;
  v_intervalo int;
  v_just text := NULLIF(btrim(COALESCE(p_atraso_justificativa, '')), '');
  v_atrasado boolean := false;
  v_atraso_min int;
  v_atraso_forma text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;
  IF p_convocacao_id IS NULL OR p_aceito IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe a oferta e a resposta.' USING ERRCODE = '22023';
  END IF;
  IF v_parcial AND NOT p_aceito THEN
    RAISE EXCEPTION 'INVALID_INPUT: horário parcial só se aplica ao aceite.' USING ERRCODE = '22023';
  END IF;
  IF v_parcial AND (p_parcial_entrada IS NULL OR p_parcial_saida IS NULL) THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe entrada e saída do horário parcial.' USING ERRCODE = '22023';
  END IF;

  v_alvo := (CASE WHEN p_aceito THEN 'aceita' ELSE 'recusada' END)::public.dp_convocacao_status;

  SELECT * INTO v_conv FROM public.dp_convocacoes WHERE id = p_convocacao_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: oferta inexistente.' USING ERRCODE = '23503';
  END IF;

  v_colab := public.dp_colaborador_of(v_uid);
  IF v_colab IS NULL OR v_colab <> v_conv.colaborador_id THEN
    RAISE EXCEPTION 'FORBIDDEN: somente o próprio trabalhador responde à sua convocação.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_conv.colaborador_id::text || '|' || v_conv.data::text, 0));

  IF v_conv.ocorrencia_id IS NOT NULL THEN
    SELECT * INTO v_ocor
      FROM public.dp_convocacao_ocorrencias
     WHERE id = v_conv.ocorrencia_id AND company_id = v_conv.company_id
     FOR UPDATE;
  END IF;

  SELECT * INTO v_conv FROM public.dp_convocacoes WHERE id = p_convocacao_id FOR UPDATE;

  IF NOT v_parcial AND v_conv.status = v_alvo AND COALESCE(v_conv.parcial_status,'') <> 'aguardando_gestor' THEN
    RETURN jsonb_build_object('ok', true, 'convocacao_id', v_conv.id,
      'status', v_conv.status::text, 'idempotente', true, 'ofertas_encerradas', 0);
  END IF;

  IF v_conv.status <> 'pendente' THEN
    RETURN jsonb_build_object('ok', false, 'convocacao_id', v_conv.id,
      'status', v_conv.status::text, 'motivo', 'INVALID_STATE');
  END IF;

  v_enc := public.dp_convocacao_estado_encerramento(
    v_conv.prazo_resposta, v_conv.inicio_previsto, v_agora);

  -- Horário já começou mas ainda não terminou: aceita com justificativa.
  IF v_enc = 'encerrada_inicio_ocorrencia'
     AND p_aceito
     AND v_conv.fim_previsto IS NOT NULL
     AND v_agora < v_conv.fim_previsto THEN
    IF v_just IS NULL THEN
      RAISE EXCEPTION 'LATE_JUSTIFICATION_REQUIRED: explique por que está respondendo depois do início.'
        USING ERRCODE = '22023';
    END IF;
    v_atrasado := true;
    v_atraso_min := GREATEST(0, (EXTRACT(EPOCH FROM (v_agora - v_conv.inicio_previsto)) / 60)::int);
    v_atraso_forma := CASE WHEN v_parcial THEN 'chegada_tardia' ELSE 'integral' END;
    v_enc := NULL;
  END IF;

  IF v_enc IS NOT NULL THEN
    IF v_enc = 'sem_resposta' THEN
      v_enc_status := 'sem_resposta';
      v_enc_motivo := 'DEADLINE_EXPIRED';
      v_enc_evento := 'oferta_sem_resposta';
    ELSE
      v_enc_status := 'encerrada_inicio_ocorrencia';
      v_enc_motivo := 'OCCURRENCE_ALREADY_STARTED';
      v_enc_evento := 'oferta_encerrada';
    END IF;

    UPDATE public.dp_convocacoes
       SET status = v_enc_status, encerrada_em = v_agora,
           encerramento_motivo = v_enc_motivo, updated_at = now()
     WHERE id = v_conv.id;
    PERFORM public.dp_convocacao_log_evento_trabalhador(
      v_conv.company_id, NULL, v_conv.ocorrencia_id, v_enc_evento,
      jsonb_build_object('convocacao_id', v_conv.id, 'motivo', v_enc_motivo,
        'prazo_resposta', v_conv.prazo_resposta, 'inicio_previsto', v_conv.inicio_previsto));
    RETURN jsonb_build_object('ok', false, 'convocacao_id', v_conv.id,
      'status', v_enc_status::text, 'motivo', v_enc_motivo);
  END IF;

  -- recusa (motivo opcional)
  IF NOT p_aceito THEN
    UPDATE public.dp_convocacoes
       SET status = 'recusada', respondida_em = v_agora, motivo_recusa = v_motivo,
           resposta_tipo = 'integral',
           parcial_status = NULL, parcial_entrada = NULL, parcial_saida = NULL,
           parcial_termina_no_dia_seguinte = NULL, parcial_carga_horas = NULL,
           parcial_observacao = NULL,
           visualizada_em = COALESCE(visualizada_em, v_agora), updated_at = now()
     WHERE id = v_conv.id;

    PERFORM public.dp_convocacao_log_evento_trabalhador(
      v_conv.company_id, NULL, v_conv.ocorrencia_id, 'oferta_recusada',
      jsonb_build_object('convocacao_id', v_conv.id, 'colaborador_id', v_conv.colaborador_id,
        'motivo', v_motivo));

    RETURN jsonb_build_object('ok', true, 'convocacao_id', v_conv.id, 'status', 'recusada',
      'idempotente', false, 'ofertas_encerradas', 0);
  END IF;

  -- proposta de horário parcial: reserva o dia e aguarda o gestor
  IF v_parcial THEN
    IF v_conv.ocorrencia_id IS NULL OR v_ocor.id IS NULL THEN
      RAISE EXCEPTION 'INVALID_INPUT: esta convocação não aceita horário parcial.' USING ERRCODE = '22023';
    END IF;

    v_n_ini := public.dp_minutos_do_horario(v_ocor.necessidade_entrada);
    v_n_fim := public.dp_minutos_do_horario(v_ocor.necessidade_saida);
    IF COALESCE(v_ocor.necessidade_termina_no_dia_seguinte, false) OR v_n_fim <= v_n_ini THEN
      v_n_fim := v_n_fim + 1440;
    END IF;

    v_p_vira := COALESCE(p_parcial_termina_no_dia_seguinte, false);
    v_p_ini := public.dp_minutos_do_horario(p_parcial_entrada);
    v_p_fim := public.dp_minutos_do_horario(p_parcial_saida);
    IF v_p_vira OR v_p_fim <= v_p_ini THEN
      v_p_fim := v_p_fim + 1440;
      v_p_vira := true;
    END IF;

    IF v_p_ini < v_n_ini OR v_p_fim > v_n_fim THEN
      RAISE EXCEPTION 'PARTIAL_OUT_OF_WINDOW: o horário parcial deve ficar dentro do horário pedido.'
        USING ERRCODE = '22023';
    END IF;
    IF v_p_ini = v_n_ini AND v_p_fim = v_n_fim THEN
      RAISE EXCEPTION 'PARTIAL_IS_FULL: este horário é o horário completo — use aceitar.'
        USING ERRCODE = '22023';
    END IF;

    IF public.dp_colaborador_horario_ocupado(
         v_conv.colaborador_id, v_conv.data, p_parcial_entrada, p_parcial_saida,
         v_p_vira, v_conv.id, false) THEN
      RAISE EXCEPTION 'WORKER_ALREADY_BOOKED: você já tem outra convocação confirmada nesse horário.'
        USING ERRCODE = '22023';
    END IF;

    v_intervalo := LEAST(GREATEST(COALESCE(v_conv.intervalo_minutos, 0), 0),
                         GREATEST(v_p_fim - v_p_ini - 1, 0));
    v_p_carga := round(((v_p_fim - v_p_ini) - v_intervalo)::numeric / 60.0, 2);
    IF v_p_carga <= 0 THEN
      RAISE EXCEPTION 'PARTIAL_INVALID_DURATION: o horário parcial precisa ter duração maior que zero.'
        USING ERRCODE = '22023';
    END IF;

    UPDATE public.dp_convocacoes
       SET resposta_tipo = 'parcial',
           parcial_entrada = p_parcial_entrada,
           parcial_saida = p_parcial_saida,
           parcial_termina_no_dia_seguinte = v_p_vira,
           parcial_carga_horas = v_p_carga,
           parcial_observacao = NULLIF(btrim(COALESCE(p_parcial_observacao, '')), ''),
           parcial_status = 'aguardando_gestor',
           parcial_decidido_em = NULL, parcial_decidido_por = NULL, parcial_decisao_motivo = NULL,
           aceite_atrasado = v_atrasado,
           aceite_atraso_minutos = CASE WHEN v_atrasado THEN v_atraso_min ELSE NULL END,
           aceite_atraso_justificativa = CASE WHEN v_atrasado THEN v_just ELSE NULL END,
           aceite_atraso_forma = v_atraso_forma,
           visualizada_em = COALESCE(visualizada_em, v_agora),
           updated_at = now()
     WHERE id = v_conv.id;

    PERFORM public.dp_convocacao_log_evento_trabalhador(
      v_conv.company_id, NULL, v_conv.ocorrencia_id,
      CASE WHEN v_atrasado THEN 'oferta_aceita_com_atraso' ELSE 'oferta_parcial_proposta' END,
      jsonb_build_object('convocacao_id', v_conv.id, 'colaborador_id', v_conv.colaborador_id,
        'entrada', p_parcial_entrada, 'saida', p_parcial_saida,
        'termina_no_dia_seguinte', v_p_vira, 'carga_prevista_horas', v_p_carga,
        'observacao', p_parcial_observacao,
        'aceite_atrasado', v_atrasado, 'atraso_minutos', v_atraso_min,
        'atraso_forma', v_atraso_forma, 'atraso_justificativa', v_just));

    RETURN jsonb_build_object('ok', true, 'convocacao_id', v_conv.id, 'status', 'pendente',
      'parcial_status', 'aguardando_gestor', 'carga_prevista_horas', v_p_carga,
      'aceite_atrasado', v_atrasado, 'atraso_minutos', v_atraso_min,
      'idempotente', false, 'ofertas_encerradas', 0);
  END IF;

  -- aceite integral
  IF v_conv.ocorrencia_id IS NOT NULL AND v_ocor.id IS NOT NULL THEN
    SELECT count(*) INTO v_aceitas
      FROM public.dp_convocacoes c
     WHERE c.ocorrencia_id = v_ocor.id AND c.status = 'aceita';

    IF v_aceitas >= COALESCE(v_ocor.vagas, 1) THEN
      UPDATE public.dp_convocacoes
         SET status = 'encerrada_sem_vaga', encerrada_em = v_agora,
             encerramento_motivo = 'OFFER_FILLED', updated_at = now()
       WHERE id = v_conv.id;
      PERFORM public.dp_convocacao_log_evento_trabalhador(
        v_conv.company_id, NULL, v_conv.ocorrencia_id, 'oferta_encerrada_sem_vaga',
        jsonb_build_object('convocacao_id', v_conv.id, 'vagas', v_ocor.vagas));
      RETURN jsonb_build_object('ok', false, 'convocacao_id', v_conv.id,
        'status', 'encerrada_sem_vaga', 'motivo', 'OFFER_FILLED');
    END IF;
  END IF;

  -- Mesmo dia liberado; horário sobreposto (em qualquer unidade) não.
  IF public.dp_colaborador_horario_ocupado(
       v_conv.colaborador_id, v_conv.data, v_conv.entrada, v_conv.saida,
       COALESCE(v_conv.termina_no_dia_seguinte, false), v_conv.id, false) THEN
    RAISE EXCEPTION 'WORKER_ALREADY_BOOKED: você já tem outra convocação confirmada nesse horário.'
      USING ERRCODE = '22023';
  END IF;

  IF v_conv.ocorrencia_id IS NOT NULL THEN
    v_aval := public.dp_convocacao_avaliar_candidato(
      v_conv.colaborador_id, v_conv.ocorrencia_id, v_conv.id, false);
    IF (v_aval->>'apto')::boolean IS NOT TRUE THEN
      RAISE EXCEPTION 'ACCEPT_INELIGIBLE: %', COALESCE(v_aval->>'motivo', 'INELEGIVEL')
        USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.dp_convocacoes
     SET status = 'aceita', respondida_em = v_agora, motivo_recusa = NULL,
         resposta_tipo = 'integral',
         parcial_status = NULL, parcial_entrada = NULL, parcial_saida = NULL,
         parcial_termina_no_dia_seguinte = NULL, parcial_carga_horas = NULL,
         aceite_atrasado = v_atrasado,
         aceite_atraso_minutos = CASE WHEN v_atrasado THEN v_atraso_min ELSE NULL END,
         aceite_atraso_justificativa = CASE WHEN v_atrasado THEN v_just ELSE NULL END,
         aceite_atraso_forma = v_atraso_forma,
         visualizada_em = COALESCE(visualizada_em, v_agora), updated_at = now()
   WHERE id = v_conv.id;

  IF v_conv.ocorrencia_id IS NOT NULL AND v_ocor.id IS NOT NULL
     AND (v_aceitas + 1) >= COALESCE(v_ocor.vagas, 1) THEN
    WITH enc AS (
      UPDATE public.dp_convocacoes
         SET status = CASE WHEN parcial_status = 'aguardando_gestor'
                           THEN 'recusada'::public.dp_convocacao_status
                           ELSE 'encerrada_sem_vaga'::public.dp_convocacao_status END,
             encerrada_em = v_agora,
             encerramento_motivo = CASE WHEN parcial_status = 'aguardando_gestor'
                                        THEN 'COVERED_BY_OTHER' ELSE 'OFFER_FILLED' END,
             parcial_status = CASE WHEN parcial_status = 'aguardando_gestor'
                                   THEN 'superada' ELSE parcial_status END,
             parcial_decidido_em = CASE WHEN parcial_status = 'aguardando_gestor'
                                        THEN v_agora ELSE parcial_decidido_em END,
             respondida_em = COALESCE(respondida_em, v_agora),
             updated_at = now()
       WHERE ocorrencia_id = v_ocor.id AND status = 'pendente' AND id <> v_conv.id
      RETURNING 1
    )
    SELECT count(*) INTO v_encerradas FROM enc;

    UPDATE public.dp_convocacao_ocorrencias
       SET status = 'preenchida', updated_at = now()
     WHERE id = v_ocor.id AND company_id = v_conv.company_id AND status = 'publicada';
  END IF;

  PERFORM public.dp_convocacao_log_evento_trabalhador(
    v_conv.company_id, NULL, v_conv.ocorrencia_id,
    CASE WHEN v_atrasado THEN 'oferta_aceita_com_atraso' ELSE 'oferta_aceita' END,
    jsonb_build_object('convocacao_id', v_conv.id, 'colaborador_id', v_conv.colaborador_id,
      'ofertas_encerradas', v_encerradas,
      'aceite_atrasado', v_atrasado, 'atraso_minutos', v_atraso_min,
      'atraso_forma', v_atraso_forma, 'atraso_justificativa', v_just));

  RETURN jsonb_build_object('ok', true, 'convocacao_id', v_conv.id, 'status', 'aceita',
    'aceite_atrasado', v_atrasado, 'atraso_minutos', v_atraso_min,
    'idempotente', false, 'ofertas_encerradas', v_encerradas);
END;
$function$;

-- 6) Portal: saber se a janela terminou e o atraso atual
DROP FUNCTION IF EXISTS public.dp_convocacao_minhas_ofertas();
CREATE FUNCTION public.dp_convocacao_minhas_ofertas()
RETURNS TABLE(
  id uuid, data date, status text, entrada time, saida time, intervalo_minutos integer,
  termina_no_dia_seguinte boolean, carga_prevista_horas numeric, prazo_resposta timestamptz,
  inicio_previsto timestamptz, fim_previsto timestamptz, visualizada_em timestamptz,
  respondida_em timestamptz, motivo_recusa text, observacao text, compatibilidade text,
  regime_snapshot text, remuneracao_snapshot jsonb, timezone_snapshot text, modalidade text,
  vagas integer, vagas_restantes integer, necessidade_entrada time, necessidade_saida time,
  necessidade_termina_no_dia_seguinte boolean, cargo_nome text, unidade_nome text,
  resposta_tipo text, parcial_status text, parcial_entrada time, parcial_saida time,
  parcial_termina_no_dia_seguinte boolean, parcial_carga_horas numeric, parcial_observacao text,
  parcial_decisao_motivo text,
  janela_comecou boolean, janela_terminou boolean, minutos_de_atraso integer,
  aceite_atrasado boolean, aceite_atraso_minutos integer,
  aceite_atraso_justificativa text, aceite_atraso_forma text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT
    c.id, c.data, c.status::text, c.entrada, c.saida, c.intervalo_minutos,
    c.termina_no_dia_seguinte, c.carga_prevista_horas, c.prazo_resposta,
    c.inicio_previsto, c.fim_previsto, c.visualizada_em, c.respondida_em,
    c.motivo_recusa, c.observacao, c.compatibilidade, c.regime_snapshot::text,
    c.remuneracao_snapshot, c.timezone_snapshot,
    g.modalidade::text,
    o.vagas,
    GREATEST(0, COALESCE(o.vagas, 1) - (
      SELECT count(*)::int FROM public.dp_convocacoes a
       WHERE a.ocorrencia_id = o.id AND a.status = 'aceita')),
    o.necessidade_entrada, o.necessidade_saida,
    o.necessidade_termina_no_dia_seguinte,
    car.nome::text, un.nome::text,
    c.resposta_tipo, c.parcial_status, c.parcial_entrada, c.parcial_saida,
    COALESCE(c.parcial_termina_no_dia_seguinte, false), c.parcial_carga_horas,
    c.parcial_observacao, c.parcial_decisao_motivo,
    (c.inicio_previsto IS NOT NULL AND now() >= c.inicio_previsto),
    (c.fim_previsto IS NOT NULL AND now() >= c.fim_previsto),
    CASE WHEN c.inicio_previsto IS NOT NULL AND now() > c.inicio_previsto
         THEN (EXTRACT(EPOCH FROM (now() - c.inicio_previsto)) / 60)::int END,
    COALESCE(c.aceite_atrasado, false), c.aceite_atraso_minutos,
    c.aceite_atraso_justificativa, c.aceite_atraso_forma
  FROM public.dp_convocacoes c
  LEFT JOIN public.dp_convocacao_ocorrencias o ON o.id = c.ocorrencia_id
  LEFT JOIN public.dp_convocacao_grupos g ON g.id = o.grupo_id
  LEFT JOIN public.dp_cargos car ON car.id = COALESCE(o.cargo_id, (
    SELECT cc.cargo_id FROM public.dp_colaboradores cc WHERE cc.id = c.colaborador_id))
  LEFT JOIN public.dp_unidades un ON un.id = c.unidade_id
  WHERE c.colaborador_id = public.dp_colaborador_of(auth.uid())
    AND (c.disponibilizada_em IS NULL OR c.disponibilizada_em <= now())
  ORDER BY c.data DESC, c.entrada;
$function$;

GRANT EXECUTE ON FUNCTION public.dp_convocacao_minhas_ofertas() TO authenticated;

-- 7) Gestor: aceite atrasado visível na aprovação do horário parcial
CREATE OR REPLACE FUNCTION public.dp_convocacao_parciais_pendentes(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.dp_convocacao_exige_admin(p_company_id);

  RETURN COALESCE((
    SELECT jsonb_agg(x ORDER BY x->>'data')
      FROM (
        SELECT jsonb_build_object(
                 'convocacao_id', c.id,
                 'ocorrencia_id', c.ocorrencia_id,
                 'data', c.data,
                 'colaborador_id', c.colaborador_id,
                 'colaborador_nome', col.nome,
                 'cargo_nome', car.nome,
                 'unidade_nome', un.nome,
                 'necessidade_entrada', o.necessidade_entrada,
                 'necessidade_saida', o.necessidade_saida,
                 'necessidade_termina_no_dia_seguinte',
                   COALESCE(o.necessidade_termina_no_dia_seguinte, false),
                 'parcial_entrada', c.parcial_entrada,
                 'parcial_saida', c.parcial_saida,
                 'parcial_termina_no_dia_seguinte', COALESCE(c.parcial_termina_no_dia_seguinte, false),
                 'parcial_carga_horas', c.parcial_carga_horas,
                 'parcial_observacao', c.parcial_observacao,
                 'aceite_atrasado', COALESCE(c.aceite_atrasado, false),
                 'aceite_atraso_minutos', c.aceite_atraso_minutos,
                 'aceite_atraso_justificativa', c.aceite_atraso_justificativa,
                 'aceite_atraso_forma', c.aceite_atraso_forma,
                 'proposta_em', c.updated_at,
                 'prazo_resposta', c.prazo_resposta,
                 'inicio_previsto', c.inicio_previsto,
                 'reoferta_prazo', c.parcial_reoferta_prazo,
                 'reofertas_pendentes', (
                   SELECT count(*)::int FROM public.dp_convocacoes r
                    WHERE r.reoferta_de_convocacao_id = c.id AND r.status = 'pendente')
               ) AS x
          FROM public.dp_convocacoes c
          JOIN public.dp_colaboradores col ON col.id = c.colaborador_id
          LEFT JOIN public.dp_convocacao_ocorrencias o ON o.id = c.ocorrencia_id
          LEFT JOIN public.dp_cargos car ON car.id = o.cargo_id
          LEFT JOIN public.dp_unidades un ON un.id = c.unidade_id
         WHERE c.company_id = p_company_id
           AND c.parcial_status = 'aguardando_gestor'
           AND c.status = 'pendente'
      ) s
  ), '[]'::jsonb);
END;
$function$;