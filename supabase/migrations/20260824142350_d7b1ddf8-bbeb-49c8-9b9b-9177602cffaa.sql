-- ============================================================
-- M23 — Helper temporal central + worker de encerramentos + pg_cron
-- ============================================================

-- 1) Helper central dos dois relógios (regra idêntica à M21)
CREATE OR REPLACE FUNCTION public.dp_convocacao_estado_encerramento(
  p_prazo_resposta timestamptz,
  p_inicio_previsto timestamptz,
  p_agora timestamptz
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_prazo_resposta IS NULL AND p_inicio_previsto IS NULL THEN NULL
    -- prazo precede (empate → prazo)
    WHEN (p_prazo_resposta IS NOT NULL
          AND (p_inicio_previsto IS NULL OR p_prazo_resposta <= p_inicio_previsto)) THEN
      CASE
        WHEN p_agora >= p_prazo_resposta THEN 'sem_resposta'
        WHEN p_inicio_previsto IS NOT NULL AND p_agora >= p_inicio_previsto
          THEN 'encerrada_inicio_ocorrencia'
        ELSE NULL
      END
    -- início precede
    ELSE
      CASE
        WHEN p_agora >= p_inicio_previsto THEN 'encerrada_inicio_ocorrencia'
        WHEN p_prazo_resposta IS NOT NULL AND p_agora >= p_prazo_resposta THEN 'sem_resposta'
        ELSE NULL
      END
  END;
$$;

REVOKE ALL ON FUNCTION public.dp_convocacao_estado_encerramento(timestamptz, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_estado_encerramento(timestamptz, timestamptz, timestamptz) TO service_role;

-- 2) Resposta do trabalhador passa a usar o helper (comportamento idêntico)
CREATE OR REPLACE FUNCTION public.dp_convocacao_responder_oferta(
  p_convocacao_id uuid,
  p_aceito boolean,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;
  IF p_convocacao_id IS NULL OR p_aceito IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe a oferta e a resposta.' USING ERRCODE = '22023';
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

  IF v_conv.status = v_alvo THEN
    RETURN jsonb_build_object('ok', true, 'convocacao_id', v_conv.id,
      'status', v_conv.status::text, 'idempotente', true, 'ofertas_encerradas', 0);
  END IF;

  IF v_conv.status <> 'pendente' THEN
    RETURN jsonb_build_object('ok', false, 'convocacao_id', v_conv.id,
      'status', v_conv.status::text, 'motivo', 'INVALID_STATE');
  END IF;

  -- precedência temporal: regra única, centralizada no helper
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
           visualizada_em = COALESCE(visualizada_em, v_agora), updated_at = now()
     WHERE id = v_conv.id;

    PERFORM public.dp_convocacao_log_evento_trabalhador(
      v_conv.company_id, NULL, v_conv.ocorrencia_id, 'oferta_recusada',
      jsonb_build_object('convocacao_id', v_conv.id, 'colaborador_id', v_conv.colaborador_id,
        'motivo', v_motivo));

    RETURN jsonb_build_object('ok', true, 'convocacao_id', v_conv.id, 'status', 'recusada',
      'idempotente', false, 'ofertas_encerradas', 0);
  END IF;

  -- aceite
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
         visualizada_em = COALESCE(visualizada_em, v_agora), updated_at = now()
   WHERE id = v_conv.id;

  IF v_conv.ocorrencia_id IS NOT NULL AND v_ocor.id IS NOT NULL
     AND (v_aceitas + 1) >= COALESCE(v_ocor.vagas, 1) THEN
    WITH enc AS (
      UPDATE public.dp_convocacoes
         SET status = 'encerrada_sem_vaga', encerrada_em = v_agora,
             encerramento_motivo = 'OFFER_FILLED', updated_at = now()
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
$$;

REVOKE ALL ON FUNCTION public.dp_convocacao_responder_oferta(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_responder_oferta(uuid, boolean, text) TO authenticated, service_role;

-- 3) Worker de materialização (interno, não exposto ao frontend)
CREATE OR REPLACE FUNCTION public.dp_convocacao_materializar_encerramentos(
  p_limit integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agora timestamptz := now();
  v_limit int := GREATEST(1, LEAST(COALESCE(p_limit, 500), 5000));
  v_sem_resposta int := 0;
  v_inicio int := 0;
  v_enc text;
  v_status public.dp_convocacao_status;
  v_motivo text;
  v_evento text;
  r record;
BEGIN
  FOR r IN
    SELECT c.id, c.company_id, c.ocorrencia_id, c.prazo_resposta, c.inicio_previsto
      FROM public.dp_convocacoes c
     WHERE c.status = 'pendente'
       AND c.ocorrencia_id IS NOT NULL
       AND public.dp_convocacao_estado_encerramento(
             c.prazo_resposta, c.inicio_previsto, v_agora) IS NOT NULL
     ORDER BY COALESCE(c.prazo_resposta, c.inicio_previsto)
     LIMIT v_limit
     FOR UPDATE SKIP LOCKED
  LOOP
    -- revalida sob o lock: outro fluxo pode ter decidido nesse intervalo
    PERFORM 1 FROM public.dp_convocacoes c2
      WHERE c2.id = r.id AND c2.status = 'pendente';
    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    v_enc := public.dp_convocacao_estado_encerramento(
      r.prazo_resposta, r.inicio_previsto, v_agora);
    IF v_enc IS NULL THEN
      CONTINUE;
    END IF;

    IF v_enc = 'sem_resposta' THEN
      v_status := 'sem_resposta';
      v_motivo := 'DEADLINE_EXPIRED';
      v_evento := 'oferta_sem_resposta';
    ELSE
      v_status := 'encerrada_inicio_ocorrencia';
      v_motivo := 'OCCURRENCE_ALREADY_STARTED';
      v_evento := 'oferta_encerrada_inicio';
    END IF;

    UPDATE public.dp_convocacoes
       SET status = v_status, encerrada_em = v_agora,
           encerramento_motivo = v_motivo, updated_at = now()
     WHERE id = r.id AND status = 'pendente';

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    INSERT INTO public.dp_convocacao_eventos(
      company_id, grupo_id, ocorrencia_id, convocacao_id, tipo,
      de_status, para_status, ator_user_id, ator_papel, payload)
    VALUES (r.company_id, NULL, r.ocorrencia_id, r.id, v_evento,
      'pendente', v_status::text, NULL, 'sistema',
      jsonb_build_object('motivo', v_motivo,
        'prazo_resposta', r.prazo_resposta, 'inicio_previsto', r.inicio_previsto));

    IF v_status = 'sem_resposta' THEN
      v_sem_resposta := v_sem_resposta + 1;
    ELSE
      v_inicio := v_inicio + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'processadas', v_sem_resposta + v_inicio,
    'sem_resposta', v_sem_resposta,
    'encerrada_inicio_ocorrencia', v_inicio,
    'limite', v_limit);
END;
$$;

REVOKE ALL ON FUNCTION public.dp_convocacao_materializar_encerramentos(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_convocacao_materializar_encerramentos(integer) FROM anon;
REVOKE ALL ON FUNCTION public.dp_convocacao_materializar_encerramentos(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_materializar_encerramentos(integer) TO service_role;

-- 4) pg_cron: um único job, idempotente pelo nome
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
      FROM cron.job WHERE jobname = 'dp_convocacoes_encerramentos';
    PERFORM cron.schedule(
      'dp_convocacoes_encerramentos',
      '*/5 * * * *',
      $cmd$ SELECT public.dp_convocacao_materializar_encerramentos(500); $cmd$);
  END IF;
END;
$$;