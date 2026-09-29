CREATE OR REPLACE FUNCTION public.dp_folga_autoatribuicao_plano(
  _company uuid, _unidade uuid, _competencia date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_comp date;
  v_fim date;
  v_dias int[];
  v_exigidas int;
  v_colab record;
  v_data date;
  v_escolhida date;
  v_escolhida_bloq date;
  v_escolhida_lim date;
  v_lim jsonb;
  v_limite int;
  v_ocupacao int;
  v_melhor int;
  v_faltam int;
  v_ja int;
  v_conflitou boolean;
  v_lotou boolean;
  v_bloqueou boolean;
  v_bloqueada boolean;
  v_ignora_bloqueio boolean;
  v_excede_limite boolean;
  v_key text;
  v_cache_dias jsonb := '{}'::jsonb;
  v_cache_exig jsonb := '{}'::jsonb;
  v_plan jsonb := '{}'::jsonb;
  v_planejados jsonb := '[]'::jsonb;
  v_itens jsonb := '[]'::jsonb;
  v_elegiveis int := 0;
  v_dias_base int[];
  v_datas date[];
  v_datas_txt text[];
  v_ocup jsonb;
  v_txt text;
BEGIN
  IF _company IS NULL OR _competencia IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: empresa e competência obrigatórias.' USING ERRCODE = '22023';
  END IF;
  IF NOT private.is_company_admin_or_owner(auth.uid(), _company) THEN
    RAISE EXCEPTION 'FORBIDDEN: acesso restrito a administradores da empresa.' USING ERRCODE = '42501';
  END IF;

  v_comp := date_trunc('month', _competencia)::date;
  v_fim := (date_trunc('month', _competencia) + interval '1 month - 1 day')::date;
  v_dias_base := public.dp_folga_dias_fds_aplicaveis(_company, _unidade);

  FOR v_colab IN
    SELECT c.id, c.nome, c.cargo_id, c.unidade_id,
           (f.dados->>'tem')::boolean AS tem_ferias,
           NULLIF(f.dados->>'inicio', '')::date AS fer_ini,
           NULLIF(f.dados->>'fim', '')::date AS fer_fim
      FROM public.dp_colaboradores c
      CROSS JOIN LATERAL (
        SELECT public.dp_folga_ferias_no_mes(_company, c.id, v_comp) AS dados
      ) f
     WHERE c.company_id = _company
       AND c.deleted_at IS NULL
       AND c.ativo IS NOT false
       AND (_unidade IS NULL OR c.unidade_id = _unidade)
     ORDER BY tem_ferias DESC NULLS LAST, c.nome
  LOOP
    v_key := COALESCE(v_colab.unidade_id::text, 'empresa');
    IF v_cache_dias ? v_key THEN
      SELECT array_agg(x::int) INTO v_dias FROM jsonb_array_elements_text(v_cache_dias->v_key) AS x;
      v_exigidas := (v_cache_exig->>v_key)::int;
    ELSE
      v_dias := public.dp_folga_dias_fds_aplicaveis(_company, v_colab.unidade_id);
      SELECT COALESCE((public.dp_folgas_janela_efetiva(_company, v_colab.unidade_id, NULL)->>'folgas_exigidas')::int, 1)
        INTO v_exigidas;
      v_cache_dias := jsonb_set(v_cache_dias, ARRAY[v_key], to_jsonb(COALESCE(v_dias, '{}'::int[])), true);
      v_cache_exig := jsonb_set(v_cache_exig, ARRAY[v_key], to_jsonb(COALESCE(v_exigidas, 0)), true);
    END IF;

    IF v_exigidas IS NULL OR v_exigidas <= 0 OR v_dias IS NULL OR array_length(v_dias, 1) IS NULL THEN
      CONTINUE;
    END IF;

    IF NOT public.dp_folga_exige_descanso_fds(_company, v_colab.id, v_dias, v_comp) THEN
      CONTINUE;
    END IF;

    v_elegiveis := v_elegiveis + 1;
    v_ja := public.dp_folga_marcadas_no_mes(_company, v_colab.id, v_comp, v_dias);
    v_faltam := v_exigidas - COALESCE(v_ja, 0);

    IF v_faltam <= 0 THEN
      CONTINUE;
    END IF;

    -- Datas válidas do mês para esta pessoa: fora das férias e das licenças.
    -- Quem tem férias no mês recebe os dias mais próximos da saída e do retorno.
    SELECT array_agg(d ORDER BY ord), array_agg(to_char(d, 'YYYY-MM-DD') ORDER BY ord)
      INTO v_datas, v_datas_txt
      FROM (
        SELECT g::date AS d,
               CASE
                 WHEN COALESCE(v_colab.tem_ferias, false)
                      AND v_colab.fer_ini IS NOT NULL AND v_colab.fer_fim IS NOT NULL
                 THEN LEAST(abs(g::date - v_colab.fer_ini), abs(g::date - v_colab.fer_fim))
                 ELSE (v_fim - g::date)
               END AS ord
          FROM generate_series(v_comp, v_fim, interval '1 day') AS g
         WHERE EXTRACT(DOW FROM g)::int = ANY (v_dias)
           AND NOT EXISTS (
             SELECT 1 FROM public.dp_ferias_gozos fg
              WHERE fg.colaborador_id = v_colab.id
                AND fg.status::text <> 'cancelado'
                AND g::date BETWEEN fg.data_inicio AND fg.data_fim)
           AND NOT EXISTS (
             SELECT 1 FROM public.dp_folgas ff
              WHERE ff.colaborador_id = v_colab.id
                AND ff.status::text <> 'cancelada'
                AND ff.tipo::text IN ('ferias', 'licenca')
                AND ff.data = g::date)
      ) AS candidatas;

    v_ocup := '{}'::jsonb;
    FOREACH v_txt IN ARRAY COALESCE(v_datas_txt, '{}') LOOP
      v_lim := public.dp_folga_limite_dia(_company, v_colab.unidade_id, v_colab.cargo_id, v_txt::date, NULL);
      v_ocup := jsonb_set(v_ocup, ARRAY[v_txt],
        to_jsonb(COALESCE((v_lim->>'em_folga')::int, 0)
                 + COALESCE((v_plan->>v_txt)::int, 0)), true);
    END LOOP;

    WHILE v_faltam > 0 LOOP
      v_escolhida := NULL;
      v_escolhida_bloq := NULL;
      v_escolhida_lim := NULL;
      v_melhor := NULL;
      v_conflitou := false;
      v_lotou := false;
      v_bloqueou := false;
      v_ignora_bloqueio := false;
      v_excede_limite := false;

      FOR v_data IN
        SELECT unnest(COALESCE(v_datas, '{}'::date[]))
      LOOP
        IF public.dp_folga_ocupado_no_dia(_company, v_colab.id, v_data) THEN CONTINUE; END IF;
        IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_planejados) p
                    WHERE (p->>'colaborador_id')::uuid = v_colab.id
                      AND (p->>'data')::date = v_data) THEN CONTINUE; END IF;

        IF COALESCE((public.dp_folga_conflito_colaboradores(
              _company, v_colab.id, v_data)->>'conflito')::boolean, false) THEN
          v_conflitou := true;
          CONTINUE;
        END IF;

        IF EXISTS (
          SELECT 1
            FROM jsonb_array_elements(v_planejados) p
            JOIN public.dp_folga_limite_regras r
              ON r.company_id = _company AND r.ativo = true AND r.tipo = 'colaboradores'
             AND (r.dia_semana IS NULL OR r.dia_semana = EXTRACT(DOW FROM v_data)::int)
             AND (r.vigencia_inicio IS NULL OR r.vigencia_inicio <= v_data)
             AND (r.vigencia_fim IS NULL OR r.vigencia_fim >= v_data)
            JOIN public.dp_folga_limite_regra_colaboradores m1
              ON m1.regra_id = r.id AND m1.colaborador_id = v_colab.id
            JOIN public.dp_folga_limite_regra_colaboradores m2
              ON m2.regra_id = r.id AND m2.colaborador_id = (p->>'colaborador_id')::uuid
           WHERE (p->>'data')::date = v_data
        ) THEN
          v_conflitou := true;
          CONTINUE;
        END IF;

        v_lim := public.dp_folga_limite_dia(_company, v_colab.unidade_id, v_colab.cargo_id, v_data, NULL);
        v_limite := NULLIF(v_lim->>'limite', '')::int;
        v_ocupacao := COALESCE((v_lim->>'em_folga')::int, 0)
                      + COALESCE((v_plan->>to_char(v_data, 'YYYY-MM-DD'))::int, 0);

        IF v_limite IS NOT NULL AND v_ocupacao >= v_limite THEN
          v_lotou := true;
          -- último recurso de quem tem férias no mês
          IF COALESCE(v_colab.tem_ferias, false) AND v_escolhida_lim IS NULL THEN
            v_escolhida_lim := v_data;
          END IF;
          CONTINUE;
        END IF;

        v_bloqueada := private.dp_folga_data_bloqueada(_company, v_colab.unidade_id, v_data);
        IF v_bloqueada THEN
          v_bloqueou := true;
          -- recurso intermediário de quem tem férias no mês
          IF COALESCE(v_colab.tem_ferias, false) AND v_escolhida_bloq IS NULL THEN
            v_escolhida_bloq := v_data;
          END IF;
          CONTINUE;
        END IF;

        IF v_ocupacao = 0 THEN
          v_escolhida := v_data;
          EXIT;
        END IF;

        IF v_melhor IS NULL OR v_ocupacao < v_melhor THEN
          v_melhor := v_ocupacao;
          v_escolhida := v_data;
        END IF;
      END LOOP;

      -- Prioridade de férias: a folga dominical do mês trabalhado não se perde.
      IF v_escolhida IS NULL AND v_escolhida_bloq IS NOT NULL THEN
        v_escolhida := v_escolhida_bloq;
        v_ignora_bloqueio := true;
      ELSIF v_escolhida IS NULL AND v_escolhida_lim IS NOT NULL THEN
        v_escolhida := v_escolhida_lim;
        v_excede_limite := true;
      END IF;

      IF v_escolhida IS NULL THEN
        v_itens := v_itens || jsonb_build_object(
          'colaborador_id', v_colab.id,
          'colaborador_nome', v_colab.nome,
          'unidade_id', v_colab.unidade_id,
          'data_sugerida', NULL,
          'excede_limite', false,
          'ignora_bloqueio', false,
          'prioridade_ferias', COALESCE(v_colab.tem_ferias, false),
          'dias', to_jsonb(COALESCE(v_dias, '{}'::int[])),
          'ocupacao', v_ocup,
          'motivo', CASE
                      WHEN v_lotou THEN 'ACIMA_DO_LIMITE'
                      WHEN v_bloqueou THEN 'DATA_BLOQUEADA'
                      WHEN v_conflitou THEN 'SEM_DIA_SEM_CONFLITO'
                      ELSE 'SEM_DIA_DISPONIVEL' END);
        EXIT;
      END IF;

      v_itens := v_itens || jsonb_build_object(
        'colaborador_id', v_colab.id,
        'colaborador_nome', v_colab.nome,
        'unidade_id', v_colab.unidade_id,
        'data_sugerida', v_escolhida,
        'excede_limite', v_excede_limite,
        'ignora_bloqueio', v_ignora_bloqueio,
        'prioridade_ferias', COALESCE(v_colab.tem_ferias, false),
        'dias', to_jsonb(COALESCE(v_dias, '{}'::int[])),
        'ocupacao', v_ocup,
        'motivo', CASE
                    WHEN v_ignora_bloqueio THEN 'PRIORIDADE_FERIAS_DATA_BLOQUEADA'
                    WHEN v_excede_limite THEN 'PRIORIDADE_FERIAS_ACIMA_DO_LIMITE'
                    ELSE NULL END);

      v_planejados := v_planejados || jsonb_build_object(
        'colaborador_id', v_colab.id, 'data', v_escolhida);
      v_txt := to_char(v_escolhida, 'YYYY-MM-DD');
      v_plan := jsonb_set(
        v_plan, ARRAY[v_txt],
        to_jsonb(COALESCE((v_plan->>v_txt)::int, 0) + 1), true);
      v_ocup := jsonb_set(
        v_ocup, ARRAY[v_txt],
        to_jsonb(COALESCE((v_ocup->>v_txt)::int, 0) + 1), true);

      v_faltam := v_faltam - 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'competencia', v_comp,
    'dias', COALESCE(v_dias_base, '{}'::int[]),
    'folgas_exigidas', COALESCE((public.dp_folgas_janela_efetiva(_company, _unidade, NULL)->>'folgas_exigidas')::int, 1),
    'elegiveis', v_elegiveis,
    'itens', v_itens);
END;
$$;

CREATE OR REPLACE FUNCTION public.dp_folga_autoatribuir_aplicar(
  _company uuid, _unidade uuid, _competencia date, _itens jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_comp date;
  v_fim date;
  v_dias int[];
  v_item jsonb;
  v_colab record;
  v_data date;
  v_lim jsonb;
  v_geradas int := 0;
  v_excedidas int := 0;
  v_ignoradas jsonb := '[]'::jsonb;
  v_exec_id uuid;
  v_excede boolean;
  v_tem_ferias boolean;
  v_ignora_bloqueio boolean;
  v_obs text;
BEGIN
  IF _company IS NULL OR _competencia IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: empresa e competência obrigatórias.' USING ERRCODE = '22023';
  END IF;
  IF NOT private.is_company_admin_or_owner(auth.uid(), _company) THEN
    RAISE EXCEPTION 'FORBIDDEN: acesso restrito a administradores da empresa.' USING ERRCODE = '42501';
  END IF;
  IF _itens IS NULL OR jsonb_typeof(_itens) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_INPUT: lista de folgas inválida.' USING ERRCODE = '22023';
  END IF;

  v_comp := date_trunc('month', _competencia)::date;
  v_fim := (date_trunc('month', _competencia) + interval '1 month - 1 day')::date;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    _company::text || '|folga_auto|' || COALESCE(_unidade::text, 'todas') || '|' || v_comp::text, 0));

  FOR v_item IN SELECT jsonb_array_elements(_itens) LOOP
    v_data := NULLIF(v_item->>'data', '')::date;

    SELECT c.id, c.nome, c.cargo_id, c.unidade_id INTO v_colab
      FROM public.dp_colaboradores c
     WHERE c.id = NULLIF(v_item->>'colaborador_id', '')::uuid
       AND c.company_id = _company
       AND c.deleted_at IS NULL
       AND c.ativo IS NOT false
       AND (_unidade IS NULL OR c.unidade_id = _unidade);

    IF v_colab.id IS NULL OR v_data IS NULL THEN
      v_ignoradas := v_ignoradas || jsonb_build_object('item', v_item, 'motivo', 'ITEM_INVALIDO');
      CONTINUE;
    END IF;

    v_dias := public.dp_folga_dias_fds_aplicaveis(_company, v_colab.unidade_id);

    IF NOT public.dp_folga_exige_descanso_fds(_company, v_colab.id, v_dias, v_comp) THEN
      v_ignoradas := v_ignoradas || jsonb_build_object(
        'colaborador_id', v_colab.id, 'colaborador_nome', v_colab.nome,
        'data', v_data, 'motivo', 'SEM_FOLGA_A_CUMPRIR');
      CONTINUE;
    END IF;

    IF v_data < v_comp OR v_data > v_fim
       OR NOT (EXTRACT(DOW FROM v_data)::int = ANY (COALESCE(v_dias, '{}'::int[]))) THEN
      v_ignoradas := v_ignoradas || jsonb_build_object(
        'colaborador_id', v_colab.id, 'colaborador_nome', v_colab.nome,
        'data', v_data, 'motivo', 'DIA_NAO_PERMITIDO');
      CONTINUE;
    END IF;

    -- o dia não pode cair dentro das férias ou da licença da própria pessoa
    IF EXISTS (
      SELECT 1 FROM public.dp_ferias_gozos fg
       WHERE fg.colaborador_id = v_colab.id
         AND fg.status::text <> 'cancelado'
         AND v_data BETWEEN fg.data_inicio AND fg.data_fim
    ) THEN
      v_ignoradas := v_ignoradas || jsonb_build_object(
        'colaborador_id', v_colab.id, 'colaborador_nome', v_colab.nome,
        'data', v_data, 'motivo', 'DIA_EM_FERIAS');
      CONTINUE;
    END IF;

    IF public.dp_folga_ocupado_no_dia(_company, v_colab.id, v_data)
       OR public.dp_folga_marcadas_no_mes(_company, v_colab.id, v_comp, v_dias) > 0 THEN
      v_ignoradas := v_ignoradas || jsonb_build_object(
        'colaborador_id', v_colab.id, 'colaborador_nome', v_colab.nome,
        'data', v_data, 'motivo', 'JA_TEM_FOLGA');
      CONTINUE;
    END IF;

    v_lim := public.dp_folga_limite_dia(_company, v_colab.unidade_id, v_colab.cargo_id, v_data, NULL);
    v_excede := COALESCE((v_lim->>'excedido')::boolean, false);

    -- exceção de data bloqueada: só vale com férias no mês, conferido aqui
    v_tem_ferias := COALESCE(
      (public.dp_folga_ferias_no_mes(_company, v_colab.id, v_comp)->>'tem')::boolean, false);
    v_ignora_bloqueio := COALESCE((v_item->>'ignora_bloqueio')::boolean, false)
                         AND v_tem_ferias
                         AND private.dp_folga_data_bloqueada(_company, v_colab.unidade_id, v_data);

    v_obs := CASE
      WHEN v_ignora_bloqueio THEN
        'Folga definida automaticamente e confirmada pelo gestor. Data bloqueada liberada por prioridade de férias no mês.'
      WHEN v_tem_ferias THEN
        'Folga definida automaticamente e confirmada pelo gestor. Dia compatível com o mês de férias.'
      ELSE 'Folga definida automaticamente e confirmada pelo gestor.'
    END;

    PERFORM set_config('dp.folga_auto_contingencia', 'on', true);
    IF v_ignora_bloqueio THEN
      PERFORM set_config('dp.folga_ignora_bloqueio', 'on', true);
    END IF;

    BEGIN
      INSERT INTO public.dp_folgas(
        company_id, colaborador_id, data, tipo, origem, status, extra, observacao)
      VALUES (_company, v_colab.id, v_data, 'normal',
              'auto_fechamento_periodo', 'agendada', false, v_obs);
    EXCEPTION WHEN OTHERS THEN
      PERFORM set_config('dp.folga_auto_contingencia', 'off', true);
      PERFORM set_config('dp.folga_ignora_bloqueio', 'off', true);
      v_ignoradas := v_ignoradas || jsonb_build_object(
        'colaborador_id', v_colab.id, 'colaborador_nome', v_colab.nome,
        'data', v_data, 'motivo', 'NAO_PERMITIDO');
      CONTINUE;
    END;

    PERFORM set_config('dp.folga_auto_contingencia', 'off', true);
    PERFORM set_config('dp.folga_ignora_bloqueio', 'off', true);
    v_geradas := v_geradas + 1;
    IF v_excede THEN v_excedidas := v_excedidas + 1; END IF;
  END LOOP;

  SELECT id INTO v_exec_id
    FROM public.dp_folga_autoatribuicao_execucoes
   WHERE company_id = _company
     AND COALESCE(unidade_id, '00000000-0000-0000-0000-000000000000'::uuid)
         = COALESCE(_unidade, '00000000-0000-0000-0000-000000000000'::uuid)
     AND competencia = v_comp
   FOR UPDATE;

  IF v_exec_id IS NULL THEN
    INSERT INTO public.dp_folga_autoatribuicao_execucoes(
      company_id, unidade_id, competencia, status, iniciada_em, concluida_em,
      quantidade_gerada, quantidade_excedida, manual, executada_por)
    VALUES (_company, _unidade, v_comp, 'concluida', now(), now(),
            v_geradas, v_excedidas, true, auth.uid())
    RETURNING id INTO v_exec_id;
  ELSE
    UPDATE public.dp_folga_autoatribuicao_execucoes
       SET status = 'concluida', concluida_em = now(), erro = NULL,
           quantidade_gerada = COALESCE(quantidade_gerada, 0) + v_geradas,
           quantidade_excedida = COALESCE(quantidade_excedida, 0) + v_excedidas,
           manual = true, executada_por = auth.uid()
     WHERE id = v_exec_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'geradas', v_geradas,
    'excedidas', v_excedidas,
    'ignoradas', v_ignoradas,
    'execucao_id', v_exec_id);
END;
$$;
