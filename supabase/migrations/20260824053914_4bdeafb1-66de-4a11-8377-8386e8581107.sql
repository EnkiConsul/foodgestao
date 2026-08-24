-- =====================================================================
-- M17 — Convocações · publicação do grupo (ofertas individuais)
-- Rollback documentado:
--   DROP FUNCTION IF EXISTS public.dp_convocacao_publicar_grupo(uuid, timestamptz, jsonb);
-- =====================================================================

CREATE OR REPLACE FUNCTION public.dp_convocacao_publicar_grupo(
  p_grupo_id uuid,
  p_expected_updated_at timestamptz,
  p_confirmacoes jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_company uuid;
  v_grupo public.dp_convocacao_grupos;
  v_cfg record;
  v_tz text;
  v_agora timestamptz := now();
  v_ocor public.dp_convocacao_ocorrencias;
  v_aval jsonb;
  v_inicio timestamptz;
  v_fim timestamptz;
  v_antecedencia integer;
  v_fora boolean;
  v_conf jsonb;
  v_just text;
  v_prazo_base timestamptz;
  v_ofertas integer;
  v_total_ofertas integer := 0;
  v_diag jsonb := '[]'::jsonb;
  v_usados jsonb := '{}'::jsonb;   -- chave "data|colaborador" => true (Option A)
  v_chave text;
  v_cand record;
  v_pend integer;
  v_publicadas integer;
  v_sem_oferta integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: autenticação obrigatória.' USING ERRCODE = '42501';
  END IF;
  IF p_grupo_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: identificador do grupo é obrigatório.' USING ERRCODE = '22023';
  END IF;

  -- company derivado do registro; jamais do cliente
  SELECT company_id INTO v_company FROM public.dp_convocacao_grupos WHERE id = p_grupo_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: grupo inexistente.' USING ERRCODE = '23503';
  END IF;

  -- autorização ANTES de qualquer lock
  v_uid := public.dp_convocacao_exige_admin(v_company);

  SELECT * INTO v_grupo
    FROM public.dp_convocacao_grupos
   WHERE id = p_grupo_id AND company_id = v_company
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: grupo inexistente.' USING ERRCODE = '23503';
  END IF;

  -- ---------------------------------------------------------------- idempotência
  IF v_grupo.status = 'publicado' THEN
    SELECT count(*) FILTER (WHERE o.status = 'rascunho'),
           count(*) FILTER (WHERE o.status = 'publicada'),
           count(*) FILTER (WHERE o.status = 'publicada'
                              AND NOT EXISTS (SELECT 1 FROM public.dp_convocacoes c WHERE c.ocorrencia_id = o.id))
      INTO v_pend, v_publicadas, v_sem_oferta
      FROM public.dp_convocacao_ocorrencias o
     WHERE o.grupo_id = v_grupo.id AND o.company_id = v_company;

    IF COALESCE(v_pend, 0) > 0 OR COALESCE(v_sem_oferta, 0) > 0 THEN
      RAISE EXCEPTION 'PUBLICATION_INCONSISTENT: o grupo está publicado com necessidades incoerentes.' USING ERRCODE = '22023';
    END IF;

    SELECT count(*) INTO v_total_ofertas
      FROM public.dp_convocacoes c
      JOIN public.dp_convocacao_ocorrencias o ON o.id = c.ocorrencia_id
     WHERE o.grupo_id = v_grupo.id AND o.company_id = v_company;

    RETURN jsonb_build_object('grupo_id', v_grupo.id, 'status', v_grupo.status,
      'ocorrencias_publicadas', v_publicadas, 'ofertas', v_total_ofertas,
      'idempotente', true, 'diagnostico', '[]'::jsonb);
  END IF;

  IF v_grupo.status <> 'rascunho' THEN
    RAISE EXCEPTION 'INVALID_STATE: somente grupos em rascunho podem ser publicados.' USING ERRCODE = '22023';
  END IF;

  IF p_expected_updated_at IS NULL OR v_grupo.updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'CONCURRENT_MODIFICATION: o grupo foi alterado por outra pessoa. Recarregue e tente novamente.' USING ERRCODE = '40001';
  END IF;

  v_tz := public.dp_convocacao_timezone(v_company, v_grupo.unidade_id);
  SELECT * INTO v_cfg FROM public.dp_convocacao_config_resolvida(v_company, v_grupo.unidade_id) LIMIT 1;

  IF NOT EXISTS (
    SELECT 1 FROM public.dp_convocacao_ocorrencias o
     WHERE o.grupo_id = v_grupo.id AND o.company_id = v_company AND o.status = 'rascunho'
  ) THEN
    RAISE EXCEPTION 'INVALID_STATE: o grupo não possui necessidades em rascunho para publicar.' USING ERRCODE = '22023';
  END IF;

  -- ---------------------------------------------------------------- ocorrências
  FOR v_ocor IN
    SELECT * FROM public.dp_convocacao_ocorrencias o
     WHERE o.grupo_id = v_grupo.id AND o.company_id = v_company AND o.status = 'rascunho'
     ORDER BY o.data, o.necessidade_entrada, o.necessidade_saida, o.cargo_id, o.id
     FOR UPDATE
  LOOP
    -- janela materializada no fuso autoritativo
    v_inicio := ((v_ocor.data + COALESCE(v_ocor.entrada, v_ocor.necessidade_entrada)) AT TIME ZONE v_tz);
    v_fim := ((v_ocor.data
               + CASE WHEN COALESCE(v_ocor.necessidade_termina_no_dia_seguinte, false)
                        OR v_ocor.necessidade_saida <= v_ocor.necessidade_entrada
                      THEN 1 ELSE 0 END
               + v_ocor.necessidade_saida) AT TIME ZONE v_tz);

    IF v_inicio <= v_agora THEN
      RAISE EXCEPTION 'OCCURRENCE_ALREADY_STARTED: a necessidade de % já começou e não pode ser publicada.', v_ocor.data
        USING ERRCODE = '22023';
    END IF;

    v_antecedencia := GREATEST(0, (v_ocor.data - (v_agora AT TIME ZONE v_tz)::date));
    v_fora := v_antecedencia < COALESCE(v_cfg.antecedencia_minima_dias, 3);

    v_conf := NULL;
    v_just := NULL;
    IF v_fora THEN
      SELECT c INTO v_conf
        FROM jsonb_array_elements(COALESCE(p_confirmacoes, '[]'::jsonb)) AS t(c)
       WHERE (c->>'ocorrencia_id')::uuid = v_ocor.id
       LIMIT 1;

      IF v_conf IS NULL THEN
        RAISE EXCEPTION 'ANTECEDENCE_CONFIRMATION_REQUIRED: a necessidade de % está abaixo da antecedência mínima e exige confirmação consciente.', v_ocor.data
          USING ERRCODE = '22023';
      END IF;

      v_just := NULLIF(btrim(COALESCE(v_conf->>'justificativa', '')), '');
      IF COALESCE(v_cfg.exige_justificativa_excecao, true) AND v_just IS NULL THEN
        RAISE EXCEPTION 'ANTECEDENCE_JUSTIFICATION_REQUIRED: a regra atual exige justificativa para publicar % fora da antecedência.', v_ocor.data
          USING ERRCODE = '22023';
      END IF;
    END IF;

    v_prazo_base := public.dp_adicionar_dias_uteis(v_agora, COALESCE(v_cfg.prazo_resposta_dias_uteis, 1), v_tz);
    v_ofertas := 0;

    IF v_grupo.modalidade = 'individual' THEN
      IF v_ocor.colaborador_alvo_id IS NULL OR v_ocor.vagas <> 1 THEN
        RAISE EXCEPTION 'INVALID_STATE: convocação individual exige uma pessoa e uma vaga na necessidade de %.', v_ocor.data
          USING ERRCODE = '22023';
      END IF;

      v_chave := v_ocor.data::text || '|' || v_ocor.colaborador_alvo_id::text;
      IF v_usados ? v_chave THEN
        RAISE EXCEPTION 'PUBLICATION_OPTION_A: a pessoa já foi convocada em outra necessidade do dia %.', v_ocor.data
          USING ERRCODE = '22023';
      END IF;

      v_aval := public.dp_convocacao_avaliar_candidato(v_ocor.colaborador_alvo_id, v_ocor.id);
      IF (v_aval->>'apto')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'PUBLICATION_TARGET_INELIGIBLE: % (necessidade de %).', COALESCE(v_aval->>'motivo', 'INELEGIVEL'), v_ocor.data
          USING ERRCODE = '22023';
      END IF;

      INSERT INTO public.dp_convocacoes(
        company_id, unidade_id, colaborador_id, data, entrada, saida, intervalo_minutos,
        termina_no_dia_seguinte, carga_prevista_horas, status, ocorrencia_id, origem_oferta,
        compatibilidade, regime_snapshot, remuneracao_snapshot, timezone_snapshot,
        inicio_previsto, fim_previsto, encerramento_operacional,
        prazo_resposta_base, prazo_resposta, disponibilizada_em, enviada_em, criada_por, observacao)
      VALUES (
        v_company, v_ocor.unidade_id, v_ocor.colaborador_alvo_id, v_ocor.data,
        (v_aval->>'entrada')::time, (v_aval->>'saida')::time, (v_aval->>'intervalo_minutos')::int,
        (v_aval->>'termina_no_dia_seguinte')::boolean, (v_aval->>'carga_prevista_horas')::numeric,
        'pendente', v_ocor.id, 'convocacao',
        v_aval->>'compatibilidade', v_aval->>'regime_snapshot', v_aval->'remuneracao_snapshot', v_tz,
        v_inicio, v_fim, v_inicio,
        v_prazo_base, v_prazo_base, v_agora, v_agora, v_uid, v_grupo.observacao);

      v_usados := v_usados || jsonb_build_object(v_chave, true);
      v_ofertas := 1;
    ELSE
      FOR v_cand IN
        SELECT c.id, c.nome
          FROM public.dp_colaboradores c
         WHERE c.company_id = v_company
           AND c.cargo_id = v_ocor.cargo_id
           AND (c.unidade_id IS NULL OR c.unidade_id = v_ocor.unidade_id)
           AND c.ativo IS NOT FALSE
           AND public.dp_regime_convocavel(c.regime)
         ORDER BY c.nome, c.id
      LOOP
        v_chave := v_ocor.data::text || '|' || v_cand.id::text;
        CONTINUE WHEN v_usados ? v_chave;

        v_aval := public.dp_convocacao_avaliar_candidato(v_cand.id, v_ocor.id);
        CONTINUE WHEN (v_aval->>'apto')::boolean IS NOT TRUE;

        INSERT INTO public.dp_convocacoes(
          company_id, unidade_id, colaborador_id, data, entrada, saida, intervalo_minutos,
          termina_no_dia_seguinte, carga_prevista_horas, status, ocorrencia_id, origem_oferta,
          compatibilidade, regime_snapshot, remuneracao_snapshot, timezone_snapshot,
          inicio_previsto, fim_previsto, encerramento_operacional,
          prazo_resposta_base, prazo_resposta, disponibilizada_em, enviada_em, criada_por, observacao)
        VALUES (
          v_company, v_ocor.unidade_id, v_cand.id, v_ocor.data,
          (v_aval->>'entrada')::time, (v_aval->>'saida')::time, (v_aval->>'intervalo_minutos')::int,
          (v_aval->>'termina_no_dia_seguinte')::boolean, (v_aval->>'carga_prevista_horas')::numeric,
          'pendente', v_ocor.id, 'convocacao',
          v_aval->>'compatibilidade', v_aval->>'regime_snapshot', v_aval->'remuneracao_snapshot', v_tz,
          v_inicio, v_fim, v_inicio,
          v_prazo_base, v_prazo_base, v_agora, v_agora, v_uid, v_grupo.observacao);

        v_usados := v_usados || jsonb_build_object(v_chave, true);
        v_ofertas := v_ofertas + 1;
      END LOOP;

      IF v_ofertas = 0 THEN
        RAISE EXCEPTION 'PUBLICATION_NO_ELIGIBLE: nenhuma pessoa elegível para a necessidade de %.', v_ocor.data
          USING ERRCODE = '22023';
      END IF;
    END IF;

    UPDATE public.dp_convocacao_ocorrencias
       SET status = 'publicada',
           publicada_em = v_agora,
           antecedencia_dias = v_antecedencia,
           fora_antecedencia = v_fora,
           confirmado_fora_prazo_por = CASE WHEN v_fora THEN v_uid ELSE NULL END,
           confirmado_fora_prazo_em = CASE WHEN v_fora THEN v_agora ELSE NULL END,
           justificativa_fora_prazo = v_just,
           updated_at = now()
     WHERE id = v_ocor.id AND company_id = v_company;

    PERFORM public.dp_convocacao_log_evento(
      v_company, v_grupo.id, v_ocor.id, 'ocorrencia_publicada',
      jsonb_build_object('de_status', 'rascunho', 'para_status', 'publicada',
        'ofertas', v_ofertas, 'vagas', v_ocor.vagas,
        'antecedencia_dias', v_antecedencia, 'fora_antecedencia', v_fora));

    v_total_ofertas := v_total_ofertas + v_ofertas;
    v_diag := v_diag || jsonb_build_array(jsonb_build_object(
      'ocorrencia_id', v_ocor.id, 'data', v_ocor.data, 'cargo_id', v_ocor.cargo_id,
      'vagas', v_ocor.vagas, 'ofertas', v_ofertas,
      'faltam_pessoas', GREATEST(0, v_ocor.vagas - v_ofertas),
      'fora_antecedencia', v_fora, 'antecedencia_dias', v_antecedencia));
  END LOOP;

  UPDATE public.dp_convocacao_grupos
     SET status = 'publicado',
         publicado_em = v_agora,
         publicado_por = v_uid,
         updated_at = now()
   WHERE id = v_grupo.id AND company_id = v_company
  RETURNING * INTO v_grupo;

  PERFORM public.dp_convocacao_log_evento(
    v_company, v_grupo.id, NULL, 'grupo_publicado',
    jsonb_build_object('de_status', 'rascunho', 'para_status', 'publicado',
      'ofertas', v_total_ofertas, 'competencia', v_grupo.competencia,
      'modalidade', v_grupo.modalidade));

  RETURN jsonb_build_object(
    'grupo_id', v_grupo.id,
    'status', v_grupo.status,
    'updated_at', v_grupo.updated_at,
    'ofertas', v_total_ofertas,
    'idempotente', false,
    'diagnostico', v_diag);
END;
$$;

REVOKE ALL ON FUNCTION public.dp_convocacao_publicar_grupo(uuid, timestamptz, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_convocacao_publicar_grupo(uuid, timestamptz, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_publicar_grupo(uuid, timestamptz, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_publicar_grupo(uuid, timestamptz, jsonb) TO service_role;