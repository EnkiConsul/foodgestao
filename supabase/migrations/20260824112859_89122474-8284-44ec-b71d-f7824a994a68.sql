-- =====================================================================
-- M19 — Convocações · hardening dos helpers e da publicação
-- Corrige M16/M17 SEM editar migrations aplicadas.
-- Objetos: dp_convocacao_remuneracao_snapshot, dp_convocacao_avaliar_candidato
--          (nova assinatura), dp_convocacao_publicar_grupo.
-- Rollback documentado:
--   As versões anteriores estão em M16/M17; reaplicar aquele SQL restaura o
--   comportamento antigo. Além disso:
--   DROP FUNCTION IF EXISTS public.dp_convocacao_avaliar_candidato(uuid, uuid, uuid, boolean);
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Remuneração V1 autoritativa
--    Intermitente: somente horista com valor_hora > 0.
--    Freelancer: horista (valor_hora) ou diarista (valor_diaria).
--    Mensalista: inelegível. Nunca converte salário mensal nem usa piso.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_convocacao_remuneracao_snapshot(
  _colaborador_id uuid,
  _carga_prevista_horas numeric
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c record;
  v_regime text;
  v_forma text;
  v_unidade text;
  v_valor numeric;
  v_qtd numeric;
BEGIN
  SELECT regime, forma_pagamento, valor_hora, valor_diaria
    INTO v_c
    FROM public.dp_colaboradores
   WHERE id = _colaborador_id;

  IF v_c IS NULL THEN
    RETURN jsonb_build_object('elegivel', false, 'motivo', 'COLABORADOR_INEXISTENTE');
  END IF;

  IF NOT public.dp_regime_convocavel(v_c.regime) THEN
    RETURN jsonb_build_object('elegivel', false, 'motivo', 'REGIME_NAO_CONVOCAVEL');
  END IF;

  v_regime := v_c.regime::text;
  v_forma := NULLIF(v_c.forma_pagamento::text, '');

  IF v_regime = 'intermitente' THEN
    -- Intermitente diarista não é permitido em V1.
    IF v_forma IS DISTINCT FROM 'horista' THEN
      RETURN jsonb_build_object('elegivel', false, 'motivo', 'INTERMITENTE_EXIGE_HORISTA');
    END IF;
    v_unidade := 'hora';
    v_valor := COALESCE(v_c.valor_hora, 0);
    v_qtd := COALESCE(_carga_prevista_horas, 0);
  ELSE
    IF v_forma = 'horista' THEN
      v_unidade := 'hora';
      v_valor := COALESCE(v_c.valor_hora, 0);
      v_qtd := COALESCE(_carga_prevista_horas, 0);
    ELSIF v_forma = 'diarista' THEN
      v_unidade := 'diaria';
      v_valor := COALESCE(v_c.valor_diaria, 0);
      v_qtd := 1;
    ELSE
      RETURN jsonb_build_object('elegivel', false, 'motivo', 'REMUNERACAO_MENSALISTA_NAO_ELEGIVEL');
    END IF;
  END IF;

  IF v_valor <= 0 THEN
    RETURN jsonb_build_object('elegivel', false, 'motivo',
      CASE WHEN v_unidade = 'diaria' THEN 'VALOR_DIARIA_AUSENTE' ELSE 'VALOR_HORA_AUSENTE' END);
  END IF;

  IF v_qtd <= 0 THEN
    RETURN jsonb_build_object('elegivel', false, 'motivo', 'QUANTIDADE_PREVISTA_INVALIDA');
  END IF;

  RETURN jsonb_build_object(
    'elegivel', true,
    'forma_pagamento', v_forma,
    'unidade_remuneracao', v_unidade,
    'valor_unitario', round(v_valor, 2),
    'quantidade_prevista', round(v_qtd, 2),
    'valor_previsto', round(v_valor * v_qtd, 2),
    'fonte', 'cadastro_colaborador');
END;
$$;

-- ---------------------------------------------------------------------
-- 2) Avaliação autoritativa do candidato — nova assinatura
--    _ignorar_convocacao_id: na revalidação do aceite a própria oferta
--    não pode ser lida como conflito.
--    _pendente_bloqueia: TRUE na publicação (evita oferta duplicada),
--    FALSE no aceite (ofertas pendentes alheias não travam a resposta).
--    Unidade: exige igualdade estrita; unidade nula não é coringa.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_convocacao_avaliar_candidato(
  _colaborador_id uuid,
  _ocorrencia_id uuid,
  _ignorar_convocacao_id uuid DEFAULT NULL,
  _pendente_bloqueia boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
  -- V1: unidade obrigatória e idêntica à da necessidade (sem coringa).
  IF v_o.unidade_id IS NULL OR v_c.unidade_id IS NULL OR v_c.unidade_id <> v_o.unidade_id THEN
    RETURN jsonb_build_object('apto', false, 'motivo', 'OUTRA_UNIDADE');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.dp_indisponibilidades i
     WHERE i.colaborador_id = _colaborador_id
       AND i.data = v_o.data
       AND i.cancelada_em IS NULL
  ) THEN
    RETURN jsonb_build_object('apto', false, 'motivo', 'INDISPONIVEL_NA_DATA');
  END IF;

  -- Option A · estados que realmente ocupam a pessoa no dia.
  IF EXISTS (
    SELECT 1 FROM public.dp_convocacoes cv
     WHERE cv.company_id = v_o.company_id
       AND cv.colaborador_id = _colaborador_id
       AND cv.data = v_o.data
       AND (_ignorar_convocacao_id IS NULL OR cv.id <> _ignorar_convocacao_id)
       AND (
         cv.status IN ('aceita', 'encerrada_operacionalmente')
         OR cv.comparecimento IS NOT NULL
         OR (_pendente_bloqueia AND cv.status = 'pendente')
       )
  ) THEN
    RETURN jsonb_build_object('apto', false, 'motivo', 'JA_CONVOCADO_NA_DATA');
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

  v_n_ini := EXTRACT(HOUR FROM v_o.necessidade_entrada)::int * 60 + EXTRACT(MINUTE FROM v_o.necessidade_entrada)::int;
  v_n_fim := EXTRACT(HOUR FROM v_o.necessidade_saida)::int * 60 + EXTRACT(MINUTE FROM v_o.necessidade_saida)::int;
  IF COALESCE(v_o.necessidade_termina_no_dia_seguinte, false) OR v_n_fim <= v_n_ini THEN
    v_n_fim := v_n_fim + 1440;
  END IF;

  v_o_ini := EXTRACT(HOUR FROM v_entrada)::int * 60 + EXTRACT(MINUTE FROM v_entrada)::int;
  v_o_fim := EXTRACT(HOUR FROM v_saida)::int * 60 + EXTRACT(MINUTE FROM v_saida)::int;
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
    'motivo', NULL,
    'entrada', v_entrada,
    'saida', v_saida,
    'intervalo_minutos', v_intervalo,
    'termina_no_dia_seguinte', v_vira,
    'carga_prevista_horas', v_carga,
    'compatibilidade', 'integral',
    'regime_snapshot', v_c.regime::text,
    'remuneracao_snapshot', v_rem - 'elegivel');
END;
$$;

-- Overload antigo de 2 argumentos sai de cena: só a nova assinatura é usada.
DROP FUNCTION IF EXISTS public.dp_convocacao_avaliar_candidato(uuid, uuid);

REVOKE ALL ON FUNCTION public.dp_convocacao_avaliar_candidato(uuid, uuid, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_convocacao_avaliar_candidato(uuid, uuid, uuid, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.dp_convocacao_avaliar_candidato(uuid, uuid, uuid, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_avaliar_candidato(uuid, uuid, uuid, boolean) TO service_role;

-- ---------------------------------------------------------------------
-- 3) Publicação do grupo — materialização por oferta e validações novas
-- ---------------------------------------------------------------------
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
  v_nec_inicio timestamptz;
  v_off_inicio timestamptz;
  v_off_fim timestamptz;
  v_antecedencia integer;
  v_fora boolean;
  v_conf jsonb;
  v_just text;
  v_prazo_base timestamptz;
  v_ofertas integer;
  v_total_ofertas integer := 0;
  v_diag jsonb := '[]'::jsonb;
  v_usados jsonb := '{}'::jsonb;
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

  SELECT company_id INTO v_company FROM public.dp_convocacao_grupos WHERE id = p_grupo_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: grupo inexistente.' USING ERRCODE = '23503';
  END IF;

  v_uid := public.dp_convocacao_exige_admin(v_company);

  SELECT * INTO v_grupo
    FROM public.dp_convocacao_grupos
   WHERE id = p_grupo_id AND company_id = v_company
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: grupo inexistente.' USING ERRCODE = '23503';
  END IF;

  IF v_grupo.status = 'publicado' THEN
    SELECT count(*) FILTER (WHERE o.status = 'rascunho'),
           count(*) FILTER (WHERE o.status IN ('publicada','preenchida')),
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

  -- Oferta aberta desabilitada na configuração vigente.
  IF v_grupo.modalidade <> 'individual' AND COALESCE(v_cfg.permite_oferta_aberta, true) IS FALSE THEN
    RAISE EXCEPTION 'OPEN_CALL_NOT_ALLOWED: as regras atuais não permitem convocação aberta nesta unidade.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.dp_convocacao_ocorrencias o
     WHERE o.grupo_id = v_grupo.id AND o.company_id = v_company AND o.status = 'rascunho'
  ) THEN
    RAISE EXCEPTION 'INVALID_STATE: o grupo não possui necessidades em rascunho para publicar.' USING ERRCODE = '22023';
  END IF;

  FOR v_ocor IN
    SELECT * FROM public.dp_convocacao_ocorrencias o
     WHERE o.grupo_id = v_grupo.id AND o.company_id = v_company AND o.status = 'rascunho'
     ORDER BY o.data, o.necessidade_entrada, o.necessidade_saida, o.cargo_id, o.id
     FOR UPDATE
  LOOP
    -- janela da NECESSIDADE (conceito separado da oferta)
    v_nec_inicio := ((v_ocor.data + v_ocor.necessidade_entrada) AT TIME ZONE v_tz);

    IF v_nec_inicio <= v_agora THEN
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

      -- confirmação consciente: presença do objeto não basta
      IF v_conf IS NULL OR COALESCE((v_conf->>'confirmado')::boolean, false) IS NOT TRUE THEN
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

      v_aval := public.dp_convocacao_avaliar_candidato(v_ocor.colaborador_alvo_id, v_ocor.id, NULL, true);
      IF (v_aval->>'apto')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'PUBLICATION_TARGET_INELIGIBLE: % (necessidade de %).', COALESCE(v_aval->>'motivo', 'INELEGIVEL'), v_ocor.data
          USING ERRCODE = '22023';
      END IF;

      -- horário REAL da oferta primeiro; só depois os timestamps
      v_off_inicio := ((v_ocor.data + (v_aval->>'entrada')::time) AT TIME ZONE v_tz);
      v_off_fim := ((v_ocor.data
                     + CASE WHEN (v_aval->>'termina_no_dia_seguinte')::boolean THEN 1 ELSE 0 END
                     + (v_aval->>'saida')::time) AT TIME ZONE v_tz);

      IF v_off_inicio <= v_agora THEN
        RAISE EXCEPTION 'OFFER_ALREADY_STARTED: o horário ofertado em % já começou e não pode ser publicado.', v_ocor.data
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
        v_off_inicio, v_off_fim, v_off_fim,
        v_prazo_base, v_prazo_base, v_agora, v_agora, v_uid, v_grupo.observacao);

      v_usados := v_usados || jsonb_build_object(v_chave, true);
      v_ofertas := 1;
    ELSE
      FOR v_cand IN
        SELECT c.id, c.nome
          FROM public.dp_colaboradores c
         WHERE c.company_id = v_company
           AND c.cargo_id = v_ocor.cargo_id
           AND c.unidade_id IS NOT NULL
           AND c.unidade_id = v_ocor.unidade_id
           AND c.ativo IS NOT FALSE
           AND public.dp_regime_convocavel(c.regime)
         ORDER BY c.nome, c.id
      LOOP
        v_chave := v_ocor.data::text || '|' || v_cand.id::text;
        CONTINUE WHEN v_usados ? v_chave;

        v_aval := public.dp_convocacao_avaliar_candidato(v_cand.id, v_ocor.id, NULL, true);
        CONTINUE WHEN (v_aval->>'apto')::boolean IS NOT TRUE;

        v_off_inicio := ((v_ocor.data + (v_aval->>'entrada')::time) AT TIME ZONE v_tz);
        v_off_fim := ((v_ocor.data
                       + CASE WHEN (v_aval->>'termina_no_dia_seguinte')::boolean THEN 1 ELSE 0 END
                       + (v_aval->>'saida')::time) AT TIME ZONE v_tz);

        -- oferta cujo horário real já começou não entra
        CONTINUE WHEN v_off_inicio <= v_agora;

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
          v_off_inicio, v_off_fim, v_off_fim,
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

REVOKE ALL ON FUNCTION public.dp_convocacao_remuneracao_snapshot(uuid, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_convocacao_remuneracao_snapshot(uuid, numeric) FROM anon;
REVOKE ALL ON FUNCTION public.dp_convocacao_remuneracao_snapshot(uuid, numeric) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_remuneracao_snapshot(uuid, numeric) TO service_role;