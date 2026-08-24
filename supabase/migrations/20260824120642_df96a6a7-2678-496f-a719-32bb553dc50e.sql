-- =====================================================================
-- M21 — Convocações · fechamento do Bloco 3
--   1) recusa sem exigência de motivo
--   2) precedência temporal por timestamps (prazo x início previsto)
--   3) visualização concorrente idempotente (um único evento)
-- Corrige M20 sem editá-la. Rollback: reaplicar o SQL de M20.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Visualização — atualização condicional + releitura na corrida
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_convocacao_registrar_visualizacao(
  p_convocacao_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_conv record;
  v_colab uuid;
  v_visto timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;

  SELECT id, company_id, colaborador_id, ocorrencia_id, visualizada_em
    INTO v_conv
    FROM public.dp_convocacoes
   WHERE id = p_convocacao_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: oferta inexistente.' USING ERRCODE = '23503';
  END IF;

  v_colab := public.dp_colaborador_of(v_uid);
  IF v_colab IS NULL OR v_colab <> v_conv.colaborador_id THEN
    RAISE EXCEPTION 'FORBIDDEN: somente o próprio trabalhador registra a visualização.'
      USING ERRCODE = '42501';
  END IF;

  IF v_conv.visualizada_em IS NOT NULL THEN
    RETURN jsonb_build_object('convocacao_id', v_conv.id,
      'visualizada_em', v_conv.visualizada_em, 'idempotente', true);
  END IF;

  -- vencedor da corrida grava; perdedor não altera linha alguma
  UPDATE public.dp_convocacoes
     SET visualizada_em = now(), updated_at = now()
   WHERE id = v_conv.id AND visualizada_em IS NULL
  RETURNING visualizada_em INTO v_visto;

  IF v_visto IS NULL THEN
    -- outra chamada venceu: relê o timestamp existente e não gera 2º evento
    SELECT visualizada_em INTO v_visto
      FROM public.dp_convocacoes WHERE id = v_conv.id;
    RETURN jsonb_build_object('convocacao_id', v_conv.id,
      'visualizada_em', v_visto, 'idempotente', true);
  END IF;

  PERFORM public.dp_convocacao_log_evento_trabalhador(
    v_conv.company_id, NULL, v_conv.ocorrencia_id, 'oferta_visualizada',
    jsonb_build_object('convocacao_id', v_conv.id, 'colaborador_id', v_conv.colaborador_id));

  RETURN jsonb_build_object('convocacao_id', v_conv.id,
    'visualizada_em', v_visto, 'idempotente', false);
END;
$$;

REVOKE ALL ON FUNCTION public.dp_convocacao_registrar_visualizacao(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_convocacao_registrar_visualizacao(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_registrar_visualizacao(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_registrar_visualizacao(uuid) TO service_role;

-- ---------------------------------------------------------------------
-- 2) Resposta à oferta — recusa sem motivo obrigatório + precedência
--    temporal decidida pelos timestamps persistidos.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_convocacao_responder_oferta(
  p_convocacao_id uuid,
  p_aceito boolean,
  p_motivo text DEFAULT NULL
) RETURNS jsonb
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
  v_prazo timestamptz;
  v_inicio timestamptz;
  v_prazo_precede boolean;
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

  -- autorização antes de qualquer lock
  SELECT * INTO v_conv FROM public.dp_convocacoes WHERE id = p_convocacao_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: oferta inexistente.' USING ERRCODE = '23503';
  END IF;

  v_colab := public.dp_colaborador_of(v_uid);
  IF v_colab IS NULL OR v_colab <> v_conv.colaborador_id THEN
    RAISE EXCEPTION 'FORBIDDEN: somente o próprio trabalhador responde à sua convocação.'
      USING ERRCODE = '42501';
  END IF;

  -- serializa por trabalhador+dia (Option A) e depois trava necessidade e oferta
  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_conv.colaborador_id::text || '|' || v_conv.data::text, 0));

  IF v_conv.ocorrencia_id IS NOT NULL THEN
    SELECT * INTO v_ocor
      FROM public.dp_convocacao_ocorrencias
     WHERE id = v_conv.ocorrencia_id AND company_id = v_conv.company_id
     FOR UPDATE;
  END IF;

  SELECT * INTO v_conv FROM public.dp_convocacoes WHERE id = p_convocacao_id FOR UPDATE;

  -- idempotência
  IF v_conv.status = v_alvo THEN
    RETURN jsonb_build_object('ok', true, 'convocacao_id', v_conv.id,
      'status', v_conv.status::text, 'idempotente', true, 'ofertas_encerradas', 0);
  END IF;

  IF v_conv.status <> 'pendente' THEN
    RETURN jsonb_build_object('ok', false, 'convocacao_id', v_conv.id,
      'status', v_conv.status::text, 'motivo', 'INVALID_STATE');
  END IF;

  -- ---------------- precedência temporal (dois relógios) ----------------
  -- Decide pelo threshold que ocorre PRIMEIRO nos timestamps persistidos.
  -- Empate → prazo (sem_resposta). Só um existente → usa o existente.
  v_prazo := v_conv.prazo_resposta;
  v_inicio := v_conv.inicio_previsto;

  IF v_prazo IS NOT NULL OR v_inicio IS NOT NULL THEN
    v_prazo_precede := CASE
      WHEN v_prazo IS NULL THEN false
      WHEN v_inicio IS NULL THEN true
      ELSE v_prazo <= v_inicio
    END;

    IF v_prazo_precede THEN
      IF v_agora >= v_prazo THEN
        v_enc_status := 'sem_resposta';
        v_enc_motivo := 'DEADLINE_EXPIRED';
        v_enc_evento := 'oferta_sem_resposta';
      ELSIF v_inicio IS NOT NULL AND v_agora >= v_inicio THEN
        v_enc_status := 'encerrada_inicio_ocorrencia';
        v_enc_motivo := 'OCCURRENCE_ALREADY_STARTED';
        v_enc_evento := 'oferta_encerrada';
      END IF;
    ELSE
      IF v_agora >= v_inicio THEN
        v_enc_status := 'encerrada_inicio_ocorrencia';
        v_enc_motivo := 'OCCURRENCE_ALREADY_STARTED';
        v_enc_evento := 'oferta_encerrada';
      ELSIF v_prazo IS NOT NULL AND v_agora >= v_prazo THEN
        v_enc_status := 'sem_resposta';
        v_enc_motivo := 'DEADLINE_EXPIRED';
        v_enc_evento := 'oferta_sem_resposta';
      END IF;
    END IF;

    IF v_enc_status IS NOT NULL THEN
      UPDATE public.dp_convocacoes
         SET status = v_enc_status, encerrada_em = v_agora,
             encerramento_motivo = v_enc_motivo, updated_at = now()
       WHERE id = v_conv.id;
      PERFORM public.dp_convocacao_log_evento_trabalhador(
        v_conv.company_id, NULL, v_conv.ocorrencia_id, v_enc_evento,
        jsonb_build_object('convocacao_id', v_conv.id, 'motivo', v_enc_motivo,
          'prazo_resposta', v_prazo, 'inicio_previsto', v_inicio));
      RETURN jsonb_build_object('ok', false, 'convocacao_id', v_conv.id,
        'status', v_enc_status::text, 'motivo', v_enc_motivo);
    END IF;
  END IF;

  -- ------------------------- recusa (motivo opcional) -------------------------
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

  -- ------------------------- aceite -------------------------
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

  -- Option A: uma convocação ocupada por pessoa/dia
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
REVOKE ALL ON FUNCTION public.dp_convocacao_responder_oferta(uuid, boolean, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_responder_oferta(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_responder_oferta(uuid, boolean, text) TO service_role;