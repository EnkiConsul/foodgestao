-- 1) Colunas da proposta parcial
ALTER TABLE public.dp_convocacoes
  ADD COLUMN IF NOT EXISTS resposta_tipo text,
  ADD COLUMN IF NOT EXISTS parcial_entrada time without time zone,
  ADD COLUMN IF NOT EXISTS parcial_saida time without time zone,
  ADD COLUMN IF NOT EXISTS parcial_termina_no_dia_seguinte boolean,
  ADD COLUMN IF NOT EXISTS parcial_carga_horas numeric,
  ADD COLUMN IF NOT EXISTS parcial_observacao text,
  ADD COLUMN IF NOT EXISTS parcial_status text,
  ADD COLUMN IF NOT EXISTS parcial_decidido_em timestamptz,
  ADD COLUMN IF NOT EXISTS parcial_decidido_por uuid,
  ADD COLUMN IF NOT EXISTS parcial_decisao_motivo text,
  ADD COLUMN IF NOT EXISTS parcial_reofertada_em timestamptz,
  ADD COLUMN IF NOT EXISTS parcial_reoferta_prazo timestamptz,
  ADD COLUMN IF NOT EXISTS reoferta_de_convocacao_id uuid;

ALTER TABLE public.dp_convocacoes
  DROP CONSTRAINT IF EXISTS ck_dp_conv_resposta_tipo,
  DROP CONSTRAINT IF EXISTS ck_dp_conv_parcial_status,
  DROP CONSTRAINT IF EXISTS ck_dp_conv_parcial_coerente,
  DROP CONSTRAINT IF EXISTS fk_dp_conv_reoferta_de;

ALTER TABLE public.dp_convocacoes
  ADD CONSTRAINT ck_dp_conv_resposta_tipo
    CHECK (resposta_tipo IS NULL OR resposta_tipo IN ('integral', 'parcial')),
  ADD CONSTRAINT ck_dp_conv_parcial_status
    CHECK (parcial_status IS NULL OR parcial_status IN ('aguardando_gestor', 'aprovada', 'recusada', 'superada')),
  ADD CONSTRAINT ck_dp_conv_parcial_coerente
    CHECK (
      (parcial_status IS NULL AND parcial_entrada IS NULL AND parcial_saida IS NULL)
      OR (parcial_status IS NOT NULL AND parcial_entrada IS NOT NULL AND parcial_saida IS NOT NULL
          AND resposta_tipo = 'parcial' AND COALESCE(parcial_carga_horas, 0) > 0)
    ),
  ADD CONSTRAINT fk_dp_conv_reoferta_de
    FOREIGN KEY (reoferta_de_convocacao_id) REFERENCES public.dp_convocacoes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dp_convocacoes_parcial_aguardando
  ON public.dp_convocacoes (company_id, data)
  WHERE parcial_status = 'aguardando_gestor';

CREATE INDEX IF NOT EXISTS idx_dp_convocacoes_reoferta_de
  ON public.dp_convocacoes (reoferta_de_convocacao_id)
  WHERE reoferta_de_convocacao_id IS NOT NULL;

-- 2) Guard: a aprovação da parcial pelo gestor não pode ser travada pelo prazo de resposta
CREATE OR REPLACE FUNCTION public.dp_convocacao_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_regime public.dp_regime_trabalho;
BEGIN
  SELECT regime INTO v_regime FROM public.dp_colaboradores WHERE id = NEW.colaborador_id;
  IF NOT public.dp_regime_convocavel(v_regime) THEN
    RAISE EXCEPTION 'Convocações são exclusivas de colaboradores com contrato intermitente ou freelancer.';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status <> OLD.status AND NEW.status IN ('aceita','recusada') THEN
    NEW.respondida_em := COALESCE(NEW.respondida_em, now());
    IF OLD.prazo_resposta IS NOT NULL AND now() > OLD.prazo_resposta
       AND COALESCE(NEW.parcial_status, '') NOT IN ('aprovada', 'recusada', 'superada') THEN
      RAISE EXCEPTION 'O prazo para responder esta convocação já expirou.';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 3) Resposta do trabalhador: aceite integral, recusa ou proposta de horário parcial
CREATE OR REPLACE FUNCTION public.dp_convocacao_responder_oferta(
  p_convocacao_id uuid,
  p_aceito boolean,
  p_motivo text DEFAULT NULL::text,
  p_parcial_entrada time without time zone DEFAULT NULL,
  p_parcial_saida time without time zone DEFAULT NULL,
  p_parcial_termina_no_dia_seguinte boolean DEFAULT NULL,
  p_parcial_observacao text DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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

    v_n_ini := EXTRACT(HOUR FROM v_ocor.necessidade_entrada)::int * 60
             + EXTRACT(MINUTE FROM v_ocor.necessidade_entrada)::int;
    v_n_fim := EXTRACT(HOUR FROM v_ocor.necessidade_saida)::int * 60
             + EXTRACT(MINUTE FROM v_ocor.necessidade_saida)::int;
    IF COALESCE(v_ocor.necessidade_termina_no_dia_seguinte, false) OR v_n_fim <= v_n_ini THEN
      v_n_fim := v_n_fim + 1440;
    END IF;

    v_p_vira := COALESCE(p_parcial_termina_no_dia_seguinte, false);
    v_p_ini := EXTRACT(HOUR FROM p_parcial_entrada)::int * 60 + EXTRACT(MINUTE FROM p_parcial_entrada)::int;
    v_p_fim := EXTRACT(HOUR FROM p_parcial_saida)::int * 60 + EXTRACT(MINUTE FROM p_parcial_saida)::int;
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
           visualizada_em = COALESCE(visualizada_em, v_agora),
           updated_at = now()
     WHERE id = v_conv.id;

    PERFORM public.dp_convocacao_log_evento_trabalhador(
      v_conv.company_id, NULL, v_conv.ocorrencia_id, 'oferta_parcial_proposta',
      jsonb_build_object('convocacao_id', v_conv.id, 'colaborador_id', v_conv.colaborador_id,
        'entrada', p_parcial_entrada, 'saida', p_parcial_saida,
        'termina_no_dia_seguinte', v_p_vira, 'carga_prevista_horas', v_p_carga,
        'observacao', p_parcial_observacao));

    RETURN jsonb_build_object('ok', true, 'convocacao_id', v_conv.id, 'status', 'pendente',
      'parcial_status', 'aguardando_gestor', 'carga_prevista_horas', v_p_carga,
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

  IF EXISTS (
    SELECT 1 FROM public.dp_convocacoes c
     WHERE c.company_id = v_conv.company_id
       AND c.colaborador_id = v_conv.colaborador_id
       AND c.data = v_conv.data
       AND c.id <> v_conv.id
       AND (c.status IN ('aceita', 'encerrada_operacionalmente') OR c.comparecimento IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'ALREADY_ACCEPTED_TODAY: você já tem uma convocação confirmada para este dia.'
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
    v_conv.company_id, NULL, v_conv.ocorrencia_id, 'oferta_aceita',
    jsonb_build_object('convocacao_id', v_conv.id, 'colaborador_id', v_conv.colaborador_id,
      'ofertas_encerradas', v_encerradas));

  RETURN jsonb_build_object('ok', true, 'convocacao_id', v_conv.id, 'status', 'aceita',
    'idempotente', false, 'ofertas_encerradas', v_encerradas);
END;
$function$;

-- 4) Avaliação da parcial: cobertura, trecho descoberto e quem mais está apto
CREATE OR REPLACE FUNCTION public.dp_convocacao_avaliar_parcial(p_convocacao_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_conv record;
  v_ocor record;
  v_cand record;
  v_aval jsonb;
  v_aptos jsonb := '[]'::jsonb;
  v_n_ini int; v_n_fim int; v_p_ini int; v_p_fim int;
  v_reofertas int := 0;
BEGIN
  IF p_convocacao_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe a convocação.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_conv FROM public.dp_convocacoes WHERE id = p_convocacao_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: convocação inexistente.' USING ERRCODE = '23503';
  END IF;
  PERFORM public.dp_convocacao_exige_admin(v_conv.company_id);

  IF v_conv.ocorrencia_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_STATE: convocação sem necessidade vinculada.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_ocor FROM public.dp_convocacao_ocorrencias WHERE id = v_conv.ocorrencia_id;

  v_n_ini := EXTRACT(HOUR FROM v_ocor.necessidade_entrada)::int * 60
           + EXTRACT(MINUTE FROM v_ocor.necessidade_entrada)::int;
  v_n_fim := EXTRACT(HOUR FROM v_ocor.necessidade_saida)::int * 60
           + EXTRACT(MINUTE FROM v_ocor.necessidade_saida)::int;
  IF COALESCE(v_ocor.necessidade_termina_no_dia_seguinte, false) OR v_n_fim <= v_n_ini THEN
    v_n_fim := v_n_fim + 1440;
  END IF;

  IF v_conv.parcial_entrada IS NOT NULL THEN
    v_p_ini := EXTRACT(HOUR FROM v_conv.parcial_entrada)::int * 60
             + EXTRACT(MINUTE FROM v_conv.parcial_entrada)::int;
    v_p_fim := EXTRACT(HOUR FROM v_conv.parcial_saida)::int * 60
             + EXTRACT(MINUTE FROM v_conv.parcial_saida)::int;
    IF COALESCE(v_conv.parcial_termina_no_dia_seguinte, false) OR v_p_fim <= v_p_ini THEN
      v_p_fim := v_p_fim + 1440;
    END IF;
  END IF;

  SELECT count(*)::int INTO v_reofertas
    FROM public.dp_convocacoes r
   WHERE r.reoferta_de_convocacao_id = v_conv.id
     AND r.status = 'pendente';

  FOR v_cand IN
    SELECT c.id, c.nome
      FROM public.dp_colaboradores c
     WHERE c.company_id = v_ocor.company_id
       AND c.cargo_id = v_ocor.cargo_id
       AND c.unidade_id = v_ocor.unidade_id
       AND c.ativo IS NOT FALSE
       AND c.id <> v_conv.colaborador_id
       AND public.dp_regime_convocavel(c.regime)
       AND NOT EXISTS (
         SELECT 1 FROM public.dp_convocacoes x
          WHERE x.ocorrencia_id = v_ocor.id AND x.colaborador_id = c.id
            AND x.status IN ('pendente', 'aceita'))
     ORDER BY c.nome, c.id
  LOOP
    v_aval := public.dp_convocacao_avaliar_candidato(v_cand.id, v_ocor.id, NULL, true);
    v_aval := public.dp_convocacao_horario_efetivo(v_ocor.id, v_cand.id, v_aval);
    IF (v_aval->>'apto')::boolean IS TRUE THEN
      v_aptos := v_aptos || jsonb_build_object(
        'colaborador_id', v_cand.id,
        'colaborador_nome', v_cand.nome,
        'entrada', v_aval->>'entrada',
        'saida', v_aval->>'saida',
        'termina_no_dia_seguinte', COALESCE((v_aval->>'termina_no_dia_seguinte')::boolean, false),
        'carga_prevista_horas', (v_aval->>'carga_prevista_horas')::numeric);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'convocacao_id', v_conv.id,
    'ocorrencia_id', v_ocor.id,
    'data', v_ocor.data,
    'parcial_status', v_conv.parcial_status,
    'necessidade_entrada', v_ocor.necessidade_entrada,
    'necessidade_saida', v_ocor.necessidade_saida,
    'necessidade_termina_no_dia_seguinte', COALESCE(v_ocor.necessidade_termina_no_dia_seguinte, false),
    'necessidade_minutos', v_n_fim - v_n_ini,
    'parcial_entrada', v_conv.parcial_entrada,
    'parcial_saida', v_conv.parcial_saida,
    'parcial_termina_no_dia_seguinte', COALESCE(v_conv.parcial_termina_no_dia_seguinte, false),
    'parcial_minutos', CASE WHEN v_p_ini IS NULL THEN NULL ELSE v_p_fim - v_p_ini END,
    'descoberto_inicio_minutos', CASE WHEN v_p_ini IS NULL THEN NULL ELSE GREATEST(v_p_ini - v_n_ini, 0) END,
    'descoberto_fim_minutos', CASE WHEN v_p_ini IS NULL THEN NULL ELSE GREATEST(v_n_fim - v_p_fim, 0) END,
    'reofertas_pendentes', v_reofertas,
    'reoferta_prazo', v_conv.parcial_reoferta_prazo,
    'aptos', v_aptos);
END;
$function$;

-- 5) Lista das propostas parciais aguardando o gestor
CREATE OR REPLACE FUNCTION public.dp_convocacao_parciais_pendentes(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
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

-- 6) Decisão do gestor sobre a parcial
CREATE OR REPLACE FUNCTION public.dp_convocacao_decidir_parcial(
  p_convocacao_id uuid,
  p_acao text,
  p_motivo text DEFAULT NULL,
  p_prazo timestamptz DEFAULT NULL,
  p_colaborador_ids uuid[] DEFAULT NULL,
  p_confirmado boolean DEFAULT false
)
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
    UPDATE public.dp_convocacoes
       SET status = 'aceita',
           entrada = v_conv.parcial_entrada,
           saida = v_conv.parcial_saida,
           termina_no_dia_seguinte = COALESCE(v_conv.parcial_termina_no_dia_seguinte, false),
           carga_prevista_horas = v_conv.parcial_carga_horas,
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

-- 7) Portal do colaborador enxerga a proposta parcial
DROP FUNCTION IF EXISTS public.dp_convocacao_minhas_ofertas();
CREATE OR REPLACE FUNCTION public.dp_convocacao_minhas_ofertas()
 RETURNS TABLE(id uuid, data date, status text, entrada time without time zone, saida time without time zone, intervalo_minutos integer, termina_no_dia_seguinte boolean, carga_prevista_horas numeric, prazo_resposta timestamp with time zone, inicio_previsto timestamp with time zone, fim_previsto timestamp with time zone, visualizada_em timestamp with time zone, respondida_em timestamp with time zone, motivo_recusa text, observacao text, compatibilidade text, regime_snapshot text, remuneracao_snapshot jsonb, timezone_snapshot text, modalidade text, vagas integer, vagas_restantes integer, necessidade_entrada time without time zone, necessidade_saida time without time zone, necessidade_termina_no_dia_seguinte boolean, cargo_nome text, unidade_nome text, resposta_tipo text, parcial_status text, parcial_entrada time without time zone, parcial_saida time without time zone, parcial_termina_no_dia_seguinte boolean, parcial_carga_horas numeric, parcial_observacao text, parcial_decisao_motivo text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
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
    c.parcial_observacao, c.parcial_decisao_motivo
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

REVOKE ALL ON FUNCTION public.dp_convocacao_minhas_ofertas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_minhas_ofertas() TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_avaliar_parcial(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_parciais_pendentes(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_decidir_parcial(uuid, text, text, timestamptz, uuid[], boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_responder_oferta(uuid, boolean, text, time without time zone, time without time zone, boolean, text) TO authenticated;