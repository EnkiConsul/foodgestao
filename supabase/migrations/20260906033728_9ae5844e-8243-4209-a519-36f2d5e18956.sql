
CREATE OR REPLACE FUNCTION public.dp_folga_autoatribuicao_plano(_company uuid, _unidade uuid, _competencia date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_comp date;
  v_fim date;
  v_dias int[];
  v_exigidas int;
  v_colab record;
  v_data date;
  v_escolhida date;
  v_lim jsonb;
  v_limite int;
  v_ocupacao int;
  v_melhor int;
  v_faltam int;
  v_ja int;
  v_conflitou boolean;
  v_lotou boolean;
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
    SELECT c.id, c.nome, c.cargo_id, c.unidade_id
      FROM public.dp_colaboradores c
     WHERE c.company_id = _company
       AND c.deleted_at IS NULL
       AND c.ativo IS NOT false
       AND (_unidade IS NULL OR c.unidade_id = _unidade)
     ORDER BY c.nome
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

    -- Datas válidas do mês para esta pessoa + ocupação atual por data
    SELECT array_agg(d::date ORDER BY d), array_agg(to_char(d::date, 'YYYY-MM-DD') ORDER BY d)
      INTO v_datas, v_datas_txt
      FROM generate_series(v_comp, v_fim, interval '1 day') AS d
     WHERE EXTRACT(DOW FROM d)::int = ANY (v_dias);

    v_ocup := '{}'::jsonb;
    FOREACH v_txt IN ARRAY COALESCE(v_datas_txt, '{}') LOOP
      v_lim := public.dp_folga_limite_dia(_company, v_colab.unidade_id, v_colab.cargo_id, v_txt::date, NULL);
      v_ocup := jsonb_set(v_ocup, ARRAY[v_txt],
        to_jsonb(COALESCE((v_lim->>'em_folga')::int, 0)
                 + COALESCE((v_plan->>v_txt)::int, 0)), true);
    END LOOP;

    WHILE v_faltam > 0 LOOP
      v_escolhida := NULL;
      v_melhor := NULL;
      v_conflitou := false;
      v_lotou := false;

      -- Varre do fim para o começo do mês: prefere dias vazios mais ao fim;
      -- na falta, o dia com menos gente, desempatando pela data mais tarde.
      FOR v_data IN
        SELECT unnest(COALESCE(v_datas, '{}'::date[])) AS d ORDER BY 1 DESC
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

      IF v_escolhida IS NULL THEN
        -- Sem criação automática acima do limite: o gestor escolhe o dia na tela.
        v_itens := v_itens || jsonb_build_object(
          'colaborador_id', v_colab.id,
          'colaborador_nome', v_colab.nome,
          'unidade_id', v_colab.unidade_id,
          'data_sugerida', NULL,
          'excede_limite', false,
          'dias', to_jsonb(COALESCE(v_dias, '{}'::int[])),
          'ocupacao', v_ocup,
          'motivo', CASE
                      WHEN v_lotou THEN 'ACIMA_DO_LIMITE'
                      WHEN v_conflitou THEN 'SEM_DIA_SEM_CONFLITO'
                      ELSE 'SEM_DIA_DISPONIVEL' END);
        EXIT;
      END IF;

      v_itens := v_itens || jsonb_build_object(
        'colaborador_id', v_colab.id,
        'colaborador_nome', v_colab.nome,
        'unidade_id', v_colab.unidade_id,
        'data_sugerida', v_escolhida,
        'excede_limite', false,
        'dias', to_jsonb(COALESCE(v_dias, '{}'::int[])),
        'ocupacao', v_ocup,
        'motivo', NULL);

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
$function$;

REVOKE ALL ON FUNCTION public.dp_folga_autoatribuicao_plano(uuid, uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_folga_autoatribuicao_plano(uuid, uuid, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.dp_folga_autoatribuir_competencia(_company uuid, _unidade uuid, _competencia date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_comp date := date_trunc('month', _competencia)::date;
  v_fim date := (date_trunc('month', _competencia) + interval '1 month - 1 day')::date;
  v_dias int[];
  v_exigidas int;
  v_exec_id uuid;
  v_colab record;
  v_data date;
  v_escolhida date;
  v_lim jsonb;
  v_ocupacao int;
  v_melhor_ocupacao int;
  v_faltam int;
  v_geradas int := 0;
  v_excedidas int := 0;
  v_detalhes jsonb := '[]'::jsonb;
  v_ja int;
  v_conflitou boolean;
  v_lotou boolean;
  v_key text;
  v_cache_dias jsonb := '{}'::jsonb;
  v_cache_exig jsonb := '{}'::jsonb;
BEGIN
  IF _company IS NULL OR _competencia IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: empresa e competência obrigatórias.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    _company::text || '|folga_auto|' || COALESCE(_unidade::text, 'todas') || '|' || v_comp::text, 0));

  SELECT id INTO v_exec_id
    FROM public.dp_folga_autoatribuicao_execucoes
   WHERE company_id = _company
     AND COALESCE(unidade_id, '00000000-0000-0000-0000-000000000000'::uuid)
         = COALESCE(_unidade, '00000000-0000-0000-0000-000000000000'::uuid)
     AND competencia = v_comp
   FOR UPDATE;

  IF v_exec_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.dp_folga_autoatribuicao_execucoes
     WHERE id = v_exec_id AND status = 'concluida'
  ) THEN
    RETURN jsonb_build_object('ok', true, 'idempotente', true, 'execucao_id', v_exec_id);
  END IF;

  IF v_exec_id IS NULL THEN
    INSERT INTO public.dp_folga_autoatribuicao_execucoes(
      company_id, unidade_id, competencia, status, iniciada_em)
    VALUES (_company, _unidade, v_comp, 'processando', now())
    RETURNING id INTO v_exec_id;
  ELSE
    UPDATE public.dp_folga_autoatribuicao_execucoes
       SET status = 'processando', iniciada_em = now(), erro = NULL
     WHERE id = v_exec_id;
  END IF;

  FOR v_colab IN
    SELECT c.id, c.cargo_id, c.unidade_id, c.nome
      FROM public.dp_colaboradores c
     WHERE c.company_id = _company
       AND c.deleted_at IS NULL
       AND c.ativo IS NOT false
       AND (_unidade IS NULL OR c.unidade_id = _unidade)
     ORDER BY c.nome
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

    SELECT count(*) INTO v_ja
      FROM public.dp_folgas f
     WHERE f.colaborador_id = v_colab.id
       AND f.data BETWEEN v_comp AND v_fim
       AND f.status <> 'cancelada'
       AND f.extra = false
       AND f.tipo NOT IN ('ferias', 'licenca')
       AND EXTRACT(DOW FROM f.data)::int = ANY (v_dias);

    v_faltam := v_exigidas - COALESCE(v_ja, 0);

    WHILE v_faltam > 0 LOOP
      v_escolhida := NULL;
      v_melhor_ocupacao := NULL;
      v_conflitou := false;
      v_lotou := false;

      -- Do fim para o começo do mês: dias vazios primeiro; depois o menos
      -- ocupado, desempatando pela data mais tarde.
      FOR v_data IN
        SELECT d::date FROM generate_series(v_comp, v_fim, interval '1 day') AS d
         WHERE EXTRACT(DOW FROM d)::int = ANY (v_dias)
         ORDER BY d DESC
      LOOP
        IF EXISTS (
          SELECT 1 FROM public.dp_folgas f
           WHERE f.colaborador_id = v_colab.id AND f.data = v_data AND f.status <> 'cancelada'
        ) THEN
          CONTINUE;
        END IF;

        IF COALESCE((public.dp_folga_conflito_colaboradores(
              _company, v_colab.id, v_data)->>'conflito')::boolean, false) THEN
          v_conflitou := true;
          CONTINUE;
        END IF;

        v_lim := public.dp_folga_limite_dia(_company, v_colab.unidade_id, v_colab.cargo_id, v_data, NULL);

        IF COALESCE((v_lim->>'excedido')::boolean, false) THEN
          v_lotou := true;
          CONTINUE;
        END IF;

        v_ocupacao := COALESCE((v_lim->>'em_folga')::int, 0);

        IF v_ocupacao = 0 THEN
          v_escolhida := v_data;
          EXIT;
        END IF;

        IF v_melhor_ocupacao IS NULL OR v_ocupacao < v_melhor_ocupacao THEN
          v_melhor_ocupacao := v_ocupacao;
          v_escolhida := v_data;
        END IF;
      END LOOP;

      IF v_escolhida IS NULL THEN
        -- Sem contingência: nada é criado acima do limite; o gestor decide.
        v_detalhes := v_detalhes || jsonb_build_object(
          'colaborador_id', v_colab.id,
          'colaborador_nome', v_colab.nome,
          'unidade_id', v_colab.unidade_id,
          'competencia', v_comp,
          'motivo', CASE
                      WHEN v_lotou THEN 'ACIMA_DO_LIMITE'
                      WHEN v_conflitou THEN 'SEM_DIA_SEM_CONFLITO'
                      ELSE 'SEM_DIA_DISPONIVEL' END);
        EXIT;
      END IF;

      INSERT INTO public.dp_folgas(
        company_id, colaborador_id, data, tipo, origem, status, extra, observacao)
      VALUES (_company, v_colab.id, v_escolhida, 'normal',
              'auto_fechamento_periodo', 'agendada', false,
              'Folga definida automaticamente no fechamento do período de escolha.');

      v_geradas := v_geradas + 1;
      v_faltam := v_faltam - 1;
    END LOOP;
  END LOOP;

  UPDATE public.dp_folga_autoatribuicao_execucoes
     SET status = 'concluida', concluida_em = now(),
         quantidade_gerada = v_geradas, quantidade_excedida = v_excedidas,
         detalhes = v_detalhes
   WHERE id = v_exec_id;

  RETURN jsonb_build_object(
    'ok', true, 'execucao_id', v_exec_id, 'geradas', v_geradas,
    'excedidas', v_excedidas, 'competencia', v_comp);
END;
$function$;

REVOKE ALL ON FUNCTION public.dp_folga_autoatribuir_competencia(uuid, uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_folga_autoatribuir_competencia(uuid, uuid, date) TO service_role;
