-- Otimização: distribuição automática de folgas com cache de ocupação em memória
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
  -- cache de limites por unidade|cargo|data
  v_cache_lim jsonb := '{}'::jsonb;
  v_lkey text;
  v_entry jsonb;
  v_limite int;
  v_por_cargo boolean;
  v_snap jsonb;
  v_k text;
  v_v jsonb;
  -- colaboradores sujeitos a regra de conflito entre colegas
  v_conflito_ids uuid[];
  -- datas já ocupadas do colaborador no mês
  v_ocupadas date[];
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

  -- Pré-computa quem participa de regra de conflito entre colegas (tipo 'colaboradores').
  SELECT COALESCE(array_agg(DISTINCT m.colaborador_id), ARRAY[]::uuid[])
    INTO v_conflito_ids
    FROM public.dp_folga_limite_regras r
    JOIN public.dp_folga_limite_regra_colaboradores m ON m.regra_id = r.id
   WHERE r.company_id = _company
     AND r.ativo = true
     AND r.tipo = 'colaboradores'
     AND (r.vigencia_inicio IS NULL OR r.vigencia_inicio <= v_fim)
     AND (r.vigencia_fim IS NULL OR r.vigencia_fim >= v_comp);

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

    IF v_faltam <= 0 THEN
      CONTINUE;
    END IF;

    -- Datas já ocupadas do colaborador no mês (uma consulta por colaborador).
    SELECT COALESCE(array_agg(f.data), ARRAY[]::date[])
      INTO v_ocupadas
      FROM public.dp_folgas f
     WHERE f.colaborador_id = v_colab.id
       AND f.data BETWEEN v_comp AND v_fim
       AND f.status <> 'cancelada';

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
        IF v_data = ANY (v_ocupadas) THEN
          CONTINUE;
        END IF;

        IF v_colab.id = ANY (v_conflito_ids)
           AND COALESCE((public.dp_folga_conflito_colaboradores(
                 _company, v_colab.id, v_data)->>'conflito')::boolean, false) THEN
          v_conflitou := true;
          CONTINUE;
        END IF;

        v_lkey := COALESCE(v_colab.unidade_id::text, '-') || '|'
               || COALESCE(v_colab.cargo_id::text, '-') || '|' || v_data::text;

        IF v_cache_lim ? v_lkey THEN
          v_entry := v_cache_lim -> v_lkey;
        ELSE
          v_lim := public.dp_folga_limite_dia(_company, v_colab.unidade_id, v_colab.cargo_id, v_data, NULL);
          v_entry := jsonb_build_object(
            'unidade', COALESCE(v_colab.unidade_id::text, '-'),
            'cargo', COALESCE(v_colab.cargo_id::text, '-'),
            'data', v_data::text,
            'limite', v_lim->'limite',
            'em_folga', COALESCE((v_lim->>'em_folga')::int, 0),
            'por_cargo', COALESCE((v_lim->>'por_cargo')::boolean, false));
          v_cache_lim := jsonb_set(v_cache_lim, ARRAY[v_lkey], v_entry, true);
        END IF;

        v_limite := NULLIF(v_entry->>'limite', '')::int;
        v_ocupacao := COALESCE((v_entry->>'em_folga')::int, 0);

        IF v_limite IS NOT NULL AND v_ocupacao >= v_limite THEN
          v_lotou := true;
          CONTINUE;
        END IF;

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

      v_ocupadas := v_ocupadas || v_escolhida;

      -- Atualiza a ocupação em memória das entradas afetadas pela nova folga.
      v_snap := v_cache_lim;
      FOR v_k, v_v IN SELECT key, value FROM jsonb_each(v_snap) LOOP
        IF (v_v->>'unidade') = COALESCE(v_colab.unidade_id::text, '-')
           AND (v_v->>'data') = v_escolhida::text
           AND (NOT COALESCE((v_v->>'por_cargo')::boolean, false)
                OR (v_v->>'cargo') = COALESCE(v_colab.cargo_id::text, '-')) THEN
          v_cache_lim := jsonb_set(
            v_cache_lim, ARRAY[v_k],
            jsonb_set(v_v, ARRAY['em_folga'],
                      to_jsonb(COALESCE((v_v->>'em_folga')::int, 0) + 1)));
        END IF;
      END LOOP;

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

-- Loteamento: a rotina diária processa poucos alvos por execução.
DROP FUNCTION IF EXISTS public.dp_folga_autoatribuir_todas();

CREATE OR REPLACE FUNCTION public.dp_folga_autoatribuir_todas(p_limite_alvos integer DEFAULT 2)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_alvo record;
  v_janela jsonb;
  v_processadas int := 0;
  v_geradas int := 0;
  v_pendentes int := 0;
  v_limite int := GREATEST(COALESCE(p_limite_alvos, 2), 1);
  v_res jsonb;
BEGIN
  FOR v_alvo IN
    SELECT DISTINCT c.company_id, c.unidade_id
      FROM public.dp_colaboradores c
     WHERE c.deleted_at IS NULL
       AND c.ativo IS NOT false
  LOOP
    v_janela := public.dp_folgas_janela_efetiva(v_alvo.company_id, v_alvo.unidade_id, NULL);

    CONTINUE WHEN NOT COALESCE((v_janela->>'ativa')::boolean, false);
    CONTINUE WHEN NOT COALESCE((v_janela->>'autoatribuir')::boolean, false);
    CONTINUE WHEN (v_janela->>'estado') <> 'encerrada';

    IF EXISTS (
      SELECT 1 FROM public.dp_folga_autoatribuicao_execucoes e
       WHERE e.company_id = v_alvo.company_id
         AND COALESCE(e.unidade_id, '00000000-0000-0000-0000-000000000000'::uuid)
             = COALESCE(v_alvo.unidade_id, '00000000-0000-0000-0000-000000000000'::uuid)
         AND e.competencia = (v_janela->>'competencia')::date
         AND e.status = 'concluida'
    ) THEN
      CONTINUE;
    END IF;

    -- Loteamento: alvos além do limite ficam para a próxima execução.
    IF v_processadas >= v_limite THEN
      v_pendentes := v_pendentes + 1;
      CONTINUE;
    END IF;

    BEGIN
      v_res := public.dp_folga_autoatribuir_competencia(
        v_alvo.company_id, v_alvo.unidade_id, (v_janela->>'competencia')::date);
      v_processadas := v_processadas + 1;
      v_geradas := v_geradas + COALESCE((v_res->>'geradas')::int, 0);
    EXCEPTION WHEN OTHERS THEN
      v_processadas := v_processadas + 1;
      INSERT INTO public.dp_folga_autoatribuicao_execucoes(
        company_id, unidade_id, competencia, status, iniciada_em, erro)
      VALUES (v_alvo.company_id, v_alvo.unidade_id, (v_janela->>'competencia')::date,
              'erro', now(), SQLERRM)
      ON CONFLICT (company_id, COALESCE(unidade_id, '00000000-0000-0000-0000-000000000000'::uuid), competencia)
      DO UPDATE SET status = 'erro', erro = EXCLUDED.erro, updated_at = now();
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'processadas', v_processadas, 'geradas', v_geradas, 'pendentes', v_pendentes);
END;
$function$;

REVOKE ALL ON FUNCTION public.dp_folga_autoatribuir_todas(integer) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_folga_autoatribuir_todas(integer) TO service_role;