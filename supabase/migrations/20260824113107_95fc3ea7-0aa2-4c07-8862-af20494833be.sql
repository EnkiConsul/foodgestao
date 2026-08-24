-- =====================================================================
-- M20 — Convocações · resposta atômica (aceite/recusa), visualização e
--       leitura enriquecida para o Portal.
-- Corrige M18 sem editá-la.
-- Rollback: reaplicar o SQL de M18 restaura a versão anterior de
--   dp_convocacao_responder_oferta; e ainda:
--   DROP FUNCTION IF EXISTS public.dp_convocacao_registrar_visualizacao(uuid);
--   DROP FUNCTION IF EXISTS public.dp_convocacao_minhas_ofertas();
--   DROP FUNCTION IF EXISTS public.dp_convocacao_log_evento_trabalhador(uuid,uuid,uuid,text,jsonb);
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Log de evento com ator trabalhador
--    dp_convocacao_log_evento() só resolve papel owner/admin e lança
--    AUDIT_ACTOR_ROLE_UNRESOLVED para o trabalhador — o que inviabilizava
--    qualquer resposta pelo Portal.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_convocacao_log_evento_trabalhador(
  _company_id uuid,
  _grupo_id uuid,
  _ocorrencia_id uuid,
  _tipo text,
  _payload jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.dp_convocacao_eventos(
    company_id, grupo_id, ocorrencia_id, tipo, ator_user_id, ator_papel, payload)
  VALUES (_company_id, _grupo_id, _ocorrencia_id, _tipo, auth.uid(), 'colaborador',
          COALESCE(_payload, '{}'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.dp_convocacao_log_evento_trabalhador(uuid, uuid, uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_convocacao_log_evento_trabalhador(uuid, uuid, uuid, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.dp_convocacao_log_evento_trabalhador(uuid, uuid, uuid, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_log_evento_trabalhador(uuid, uuid, uuid, text, jsonb) TO service_role;

-- ---------------------------------------------------------------------
-- 1) Registro de visualização da oferta (Portal)
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

  UPDATE public.dp_convocacoes
     SET visualizada_em = now(), updated_at = now()
   WHERE id = v_conv.id AND visualizada_em IS NULL
  RETURNING visualizada_em INTO v_conv.visualizada_em;

  PERFORM public.dp_convocacao_log_evento_trabalhador(
    v_conv.company_id, NULL, v_conv.ocorrencia_id, 'oferta_visualizada',
    jsonb_build_object('convocacao_id', v_conv.id, 'colaborador_id', v_conv.colaborador_id));

  RETURN jsonb_build_object('convocacao_id', v_conv.id,
    'visualizada_em', v_conv.visualizada_em, 'idempotente', false);
END;
$$;

REVOKE ALL ON FUNCTION public.dp_convocacao_registrar_visualizacao(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_convocacao_registrar_visualizacao(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_registrar_visualizacao(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_registrar_visualizacao(uuid) TO service_role;

-- ---------------------------------------------------------------------
-- 2) Leitura enriquecida das minhas ofertas (Portal)
--    Só devolve linhas do próprio trabalhador; nomes de cargo/unidade e
--    janela da necessidade vêm daqui, sem abrir RLS dessas tabelas.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_convocacao_minhas_ofertas()
RETURNS TABLE (
  id uuid,
  data date,
  status text,
  entrada time,
  saida time,
  intervalo_minutos integer,
  termina_no_dia_seguinte boolean,
  carga_prevista_horas numeric,
  prazo_resposta timestamptz,
  inicio_previsto timestamptz,
  fim_previsto timestamptz,
  visualizada_em timestamptz,
  respondida_em timestamptz,
  motivo_recusa text,
  observacao text,
  compatibilidade text,
  regime_snapshot text,
  remuneracao_snapshot jsonb,
  timezone_snapshot text,
  modalidade text,
  vagas integer,
  vagas_restantes integer,
  necessidade_entrada time,
  necessidade_saida time,
  necessidade_termina_no_dia_seguinte boolean,
  cargo_nome text,
  unidade_nome text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
    car.nome::text, un.nome::text
  FROM public.dp_convocacoes c
  LEFT JOIN public.dp_convocacao_ocorrencias o ON o.id = c.ocorrencia_id
  LEFT JOIN public.dp_convocacao_grupos g ON g.id = o.grupo_id
  LEFT JOIN public.dp_cargos car ON car.id = COALESCE(o.cargo_id, (
    SELECT cc.cargo_id FROM public.dp_colaboradores cc WHERE cc.id = c.colaborador_id))
  LEFT JOIN public.dp_unidades un ON un.id = c.unidade_id
  WHERE c.colaborador_id = public.dp_colaborador_of(auth.uid())
  ORDER BY c.data DESC, c.entrada;
$$;

REVOKE ALL ON FUNCTION public.dp_convocacao_minhas_ofertas() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_convocacao_minhas_ofertas() FROM anon;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_minhas_ofertas() TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_minhas_ofertas() TO service_role;

-- ---------------------------------------------------------------------
-- 3) Resposta à oferta — atômica, sem rollback nos encerramentos
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
  v_cfg record;
  v_colab uuid;
  v_agora timestamptz := now();
  v_aceitas int := 0;
  v_encerradas int := 0;
  v_alvo public.dp_convocacao_status;
  v_motivo text := NULLIF(btrim(COALESCE(p_motivo, '')), '');
  v_aval jsonb;
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

  -- prazo vencido materializa 'sem_resposta' (persistido, sem rollback)
  IF v_conv.prazo_resposta IS NOT NULL AND v_agora > v_conv.prazo_resposta THEN
    UPDATE public.dp_convocacoes
       SET status = 'sem_resposta', encerrada_em = v_agora,
           encerramento_motivo = 'DEADLINE_EXPIRED', updated_at = now()
     WHERE id = v_conv.id;
    PERFORM public.dp_convocacao_log_evento_trabalhador(
      v_conv.company_id, NULL, v_conv.ocorrencia_id, 'oferta_sem_resposta',
      jsonb_build_object('convocacao_id', v_conv.id, 'motivo', 'DEADLINE_EXPIRED'));
    RETURN jsonb_build_object('ok', false, 'convocacao_id', v_conv.id,
      'status', 'sem_resposta', 'motivo', 'DEADLINE_EXPIRED');
  END IF;

  -- dia já iniciado materializa 'encerrada_inicio_ocorrencia'
  IF v_conv.inicio_previsto IS NOT NULL AND v_agora >= v_conv.inicio_previsto THEN
    UPDATE public.dp_convocacoes
       SET status = 'encerrada_inicio_ocorrencia', encerrada_em = v_agora,
           encerramento_motivo = 'OCCURRENCE_ALREADY_STARTED', updated_at = now()
     WHERE id = v_conv.id;
    PERFORM public.dp_convocacao_log_evento_trabalhador(
      v_conv.company_id, NULL, v_conv.ocorrencia_id, 'oferta_encerrada',
      jsonb_build_object('convocacao_id', v_conv.id, 'motivo', 'OCCURRENCE_ALREADY_STARTED'));
    RETURN jsonb_build_object('ok', false, 'convocacao_id', v_conv.id,
      'status', 'encerrada_inicio_ocorrencia', 'motivo', 'OCCURRENCE_ALREADY_STARTED');
  END IF;

  -- ------------------------- recusa -------------------------
  IF NOT p_aceito THEN
    SELECT * INTO v_cfg
      FROM public.dp_convocacao_config_resolvida(v_conv.company_id, v_conv.unidade_id) LIMIT 1;
    IF COALESCE(v_cfg.exige_motivo_recusa, false) AND v_motivo IS NULL THEN
      RAISE EXCEPTION 'REFUSAL_REASON_REQUIRED: informe o motivo da recusa.' USING ERRCODE = '22023';
    END IF;

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
  -- vagas da necessidade: sem vaga NÃO lança exceção (preserva o encerramento)
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

  -- revalidação autoritativa no momento do aceite (ignora a própria oferta,
  -- e ofertas pendentes alheias não bloqueiam a resposta)
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

  -- vagas completas: encerra as demais ofertas pendentes da mesma necessidade
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