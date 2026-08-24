-- ============================================================
-- M22 — Indisponibilidade self-service (Intermitente/Freelancer)
-- Reutiliza dp_indisponibilidades (índice parcial único já existente:
--   uq_dp_indisponibilidades_ativa (colaborador_id, data) WHERE cancelada_em IS NULL)
-- Nunca DELETE. Histórico cancelado é preservado; nova marcação cria NOVA linha.
-- ============================================================

CREATE OR REPLACE FUNCTION public.dp_indisponibilidade_marcar(
  p_data date,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_colab_id uuid;
  v_company uuid;
  v_unidade uuid;
  v_regime public.dp_regime_trabalho;
  v_tz text;
  v_hoje date;
  v_motivo text := NULLIF(btrim(COALESCE(p_motivo, '')), '');
  v_existente uuid;
  v_id uuid;
  v_encerradas int := 0;
  r record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;
  IF p_data IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe a data.' USING ERRCODE = '22023';
  END IF;

  v_colab_id := public.dp_colaborador_ativo_of(v_uid);
  IF v_colab_id IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: cadastro de colaborador não encontrado.' USING ERRCODE = '42501';
  END IF;

  SELECT c.company_id, c.unidade_id, c.regime
    INTO v_company, v_unidade, v_regime
    FROM public.dp_colaboradores c
   WHERE c.id = v_colab_id;

  IF NOT COALESCE(public.dp_regime_convocavel(v_regime), false) THEN
    RAISE EXCEPTION 'REGIME_NAO_CONVOCAVEL: este vínculo utiliza o fluxo de folgas.'
      USING ERRCODE = '42501';
  END IF;

  v_tz := public.dp_convocacao_timezone(v_company, v_unidade);
  v_hoje := (now() AT TIME ZONE v_tz)::date;

  IF p_data < v_hoje THEN
    RAISE EXCEPTION 'PAST_DATE_NOT_EDITABLE: datas passadas não podem ser alteradas.'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_colab_id::text || '|' || p_data::text, 0));

  IF EXISTS (
    SELECT 1 FROM public.dp_convocacoes c
     WHERE c.company_id = v_company
       AND c.colaborador_id = v_colab_id
       AND c.data = p_data
       AND (c.status IN ('aceita', 'encerrada_operacionalmente') OR c.comparecimento IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'ACCEPTED_CALL_REQUIRES_REPLACEMENT: convocação confirmada neste dia.'
      USING ERRCODE = '22023';
  END IF;

  SELECT i.id INTO v_existente
    FROM public.dp_indisponibilidades i
   WHERE i.colaborador_id = v_colab_id
     AND i.data = p_data
     AND i.cancelada_em IS NULL
   LIMIT 1;

  IF v_existente IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true, 'indisponibilidade_id', v_existente, 'data', p_data,
      'idempotente', true, 'ofertas_encerradas', 0);
  END IF;

  INSERT INTO public.dp_indisponibilidades(
    company_id, colaborador_id, data, motivo, origem, criado_por)
  VALUES (v_company, v_colab_id, p_data, v_motivo, 'colaborador', v_uid)
  RETURNING id INTO v_id;

  FOR r IN
    WITH enc AS (
      UPDATE public.dp_convocacoes
         SET status = 'cancelada',
             encerrada_em = now(),
             encerramento_motivo = 'INDISPONIBILIDADE_DECLARADA',
             updated_at = now()
       WHERE company_id = v_company
         AND colaborador_id = v_colab_id
         AND data = p_data
         AND status = 'pendente'
         AND ocorrencia_id IS NOT NULL
      RETURNING id, ocorrencia_id
    )
    SELECT * FROM enc
  LOOP
    v_encerradas := v_encerradas + 1;
    PERFORM public.dp_convocacao_log_evento_trabalhador(
      v_company, NULL, r.ocorrencia_id, 'oferta_encerrada_indisponibilidade',
      jsonb_build_object(
        'convocacao_id', r.id,
        'motivo', 'INDISPONIBILIDADE_DECLARADA',
        'data', p_data));
  END LOOP;

  PERFORM public.insert_audit_log(
    'indisponibilidade_criada', 'dp_indisponibilidades', v_id::text,
    jsonb_build_object('data', p_data, 'ofertas_encerradas', v_encerradas));

  RETURN jsonb_build_object(
    'ok', true, 'indisponibilidade_id', v_id, 'data', p_data,
    'idempotente', false, 'ofertas_encerradas', v_encerradas);
END;
$$;

CREATE OR REPLACE FUNCTION public.dp_indisponibilidade_remover(p_data date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_colab_id uuid;
  v_company uuid;
  v_unidade uuid;
  v_regime public.dp_regime_trabalho;
  v_tz text;
  v_hoje date;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;
  IF p_data IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe a data.' USING ERRCODE = '22023';
  END IF;

  v_colab_id := public.dp_colaborador_ativo_of(v_uid);
  IF v_colab_id IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: cadastro de colaborador não encontrado.' USING ERRCODE = '42501';
  END IF;

  SELECT c.company_id, c.unidade_id, c.regime
    INTO v_company, v_unidade, v_regime
    FROM public.dp_colaboradores c
   WHERE c.id = v_colab_id;

  IF NOT COALESCE(public.dp_regime_convocavel(v_regime), false) THEN
    RAISE EXCEPTION 'REGIME_NAO_CONVOCAVEL: este vínculo utiliza o fluxo de folgas.'
      USING ERRCODE = '42501';
  END IF;

  v_tz := public.dp_convocacao_timezone(v_company, v_unidade);
  v_hoje := (now() AT TIME ZONE v_tz)::date;

  IF p_data < v_hoje THEN
    RAISE EXCEPTION 'PAST_DATE_NOT_EDITABLE: datas passadas não podem ser alteradas.'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_colab_id::text || '|' || p_data::text, 0));

  UPDATE public.dp_indisponibilidades
     SET cancelada_em = now(), cancelada_por = v_uid, updated_at = now()
   WHERE colaborador_id = v_colab_id
     AND data = p_data
     AND cancelada_em IS NULL
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'data', p_data, 'idempotente', true);
  END IF;

  PERFORM public.insert_audit_log(
    'indisponibilidade_removida', 'dp_indisponibilidades', v_id::text,
    jsonb_build_object('data', p_data));

  RETURN jsonb_build_object(
    'ok', true, 'indisponibilidade_id', v_id, 'data', p_data, 'idempotente', false);
END;
$$;

REVOKE ALL ON FUNCTION public.dp_indisponibilidade_marcar(date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_indisponibilidade_remover(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_indisponibilidade_marcar(date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dp_indisponibilidade_remover(date) TO authenticated, service_role;