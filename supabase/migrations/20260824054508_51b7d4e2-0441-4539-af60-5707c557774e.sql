-- =====================================================================
-- M18 — Resposta às ofertas de convocação (Portal)
-- Atômica, autorizada, idempotente e fail-closed. Sem colunas novas.
-- =====================================================================

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
  v_cfg record;
  v_colab uuid;
  v_agora timestamptz := now();
  v_aceitas int;
  v_encerradas int := 0;
  v_alvo public.dp_convocacao_status;
  v_motivo text := NULLIF(btrim(COALESCE(p_motivo, '')), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;

  v_alvo := (CASE WHEN p_aceito THEN 'aceita' ELSE 'recusada' END)::public.dp_convocacao_status;

  -- 1) autorização ANTES de qualquer lock: o dono da oferta é quem responde
  SELECT * INTO v_conv FROM public.dp_convocacoes WHERE id = p_convocacao_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: oferta inexistente.' USING ERRCODE = '23503';
  END IF;

  v_colab := public.dp_colaborador_of(v_uid);
  IF v_colab IS NULL OR v_colab <> v_conv.colaborador_id THEN
    RAISE EXCEPTION 'FORBIDDEN: somente o próprio trabalhador responde à sua convocação.'
      USING ERRCODE = '42501';
  END IF;

  -- 2) lock determinístico: necessidade primeiro, depois a oferta
  IF v_conv.ocorrencia_id IS NOT NULL THEN
    SELECT * INTO v_ocor FROM public.dp_convocacao_ocorrencias
     WHERE id = v_conv.ocorrencia_id AND company_id = v_conv.company_id
     FOR UPDATE;
  END IF;

  SELECT * INTO v_conv FROM public.dp_convocacoes WHERE id = p_convocacao_id FOR UPDATE;

  -- 3) idempotência
  IF v_conv.status = v_alvo THEN
    RETURN jsonb_build_object('convocacao_id', v_conv.id, 'status', v_conv.status,
      'idempotente', true, 'ofertas_encerradas', 0);
  END IF;

  IF v_conv.status <> 'pendente' THEN
    RAISE EXCEPTION 'INVALID_STATE: esta convocação já não está aguardando resposta.'
      USING ERRCODE = '22023';
  END IF;

  IF v_conv.prazo_resposta IS NOT NULL AND v_agora > v_conv.prazo_resposta THEN
    RAISE EXCEPTION 'DEADLINE_EXPIRED: o prazo de resposta venceu.' USING ERRCODE = '22023';
  END IF;

  IF v_conv.inicio_previsto IS NOT NULL AND v_agora >= v_conv.inicio_previsto THEN
    RAISE EXCEPTION 'OCCURRENCE_ALREADY_STARTED: o dia convocado já começou.' USING ERRCODE = '22023';
  END IF;

  -- 4) recusa: motivo conforme a regra da unidade
  IF NOT p_aceito THEN
    SELECT * INTO v_cfg
      FROM public.dp_convocacao_config_resolvida(v_conv.company_id, v_conv.unidade_id) LIMIT 1;
    IF COALESCE(v_cfg.exige_motivo_recusa, false) AND v_motivo IS NULL THEN
      RAISE EXCEPTION 'REFUSAL_REASON_REQUIRED: informe o motivo da recusa.' USING ERRCODE = '22023';
    END IF;

    UPDATE public.dp_convocacoes
       SET status = 'recusada', respondida_em = v_agora, motivo_recusa = v_motivo, updated_at = now()
     WHERE id = v_conv.id;

    PERFORM public.dp_convocacao_log_evento(
      v_conv.company_id, NULL, v_conv.ocorrencia_id, 'oferta_recusada',
      jsonb_build_object('convocacao_id', v_conv.id, 'colaborador_id', v_conv.colaborador_id));

    RETURN jsonb_build_object('convocacao_id', v_conv.id, 'status', 'recusada',
      'idempotente', false, 'ofertas_encerradas', 0);
  END IF;

  -- 5) aceite: vagas da necessidade e Option A (uma convocação por pessoa/dia)
  IF v_ocor.id IS NOT NULL THEN
    SELECT count(*) INTO v_aceitas
      FROM public.dp_convocacoes c
     WHERE c.ocorrencia_id = v_ocor.id AND c.status = 'aceita';

    IF v_aceitas >= COALESCE(v_ocor.vagas, 1) THEN
      UPDATE public.dp_convocacoes
         SET status = 'cancelada', respondida_em = v_agora,
             motivo_recusa = 'VAGA_PREENCHIDA', updated_at = now()
       WHERE id = v_conv.id;
      RAISE EXCEPTION 'OFFER_FILLED: as vagas desta necessidade já foram preenchidas.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.dp_convocacoes c
     WHERE c.company_id = v_conv.company_id
       AND c.colaborador_id = v_conv.colaborador_id
       AND c.data = v_conv.data
       AND c.id <> v_conv.id
       AND c.status = 'aceita'
  ) THEN
    RAISE EXCEPTION 'ALREADY_ACCEPTED_TODAY: você já aceitou uma convocação para este dia.'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.dp_convocacoes
     SET status = 'aceita', respondida_em = v_agora, motivo_recusa = NULL, updated_at = now()
   WHERE id = v_conv.id;

  -- 6) vagas completas: encerra as demais ofertas pendentes da mesma necessidade
  IF v_ocor.id IS NOT NULL AND (COALESCE(v_aceitas, 0) + 1) >= COALESCE(v_ocor.vagas, 1) THEN
    WITH enc AS (
      UPDATE public.dp_convocacoes
         SET status = 'cancelada', motivo_recusa = 'VAGA_PREENCHIDA', updated_at = now()
       WHERE ocorrencia_id = v_ocor.id AND status = 'pendente' AND id <> v_conv.id
      RETURNING 1
    )
    SELECT count(*) INTO v_encerradas FROM enc;
  END IF;

  PERFORM public.dp_convocacao_log_evento(
    v_conv.company_id, NULL, v_conv.ocorrencia_id, 'oferta_aceita',
    jsonb_build_object('convocacao_id', v_conv.id, 'colaborador_id', v_conv.colaborador_id,
      'ofertas_encerradas', v_encerradas));

  RETURN jsonb_build_object('convocacao_id', v_conv.id, 'status', 'aceita',
    'idempotente', false, 'ofertas_encerradas', v_encerradas);
END;
$$;

REVOKE ALL ON FUNCTION public.dp_convocacao_responder_oferta(uuid, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_convocacao_responder_oferta(uuid, boolean, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_responder_oferta(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_responder_oferta(uuid, boolean, text) TO service_role;