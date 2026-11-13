-- Distribuição automática: só oferece os dias de descanso que a pessoa trabalha
-- (ex.: quem trabalha só aos sábados recebe folga num sábado).

CREATE OR REPLACE FUNCTION public.dp_folga_autoatribuir_competencia(_company uuid, _unidade uuid, _competencia date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_comp date := date_trunc('month', _competencia)::date;
  v_fim date := (date_trunc('month', _competencia) + interval '1 month - 1 day')::date;
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_ini_cand date;
  v_ini_col date;
  v_fim_col date;
  v_dias int[];
  v_exigidas int;
  v_exec_id uuid;
  v_colab record;
  v_data date;
  v_escolhida date;
  v_contingencia boolean;
  v_cont_data date;
  v_cont_ocup int;
  v_lim jsonb;
  v_ocupacao int;
  v_melhor_ocupacao int;
  v_faltam int;
  v_geradas int := 0;
  v_excedidas int := 0;
  v_detalhes jsonb := '[]'::jsonb;
  v_ja int;
  v_conflitou boolean;
  v_bloqueou boolean;
  v_key text;
  v_cache_dias jsonb := '{}'::jsonb;
  v_cache_exig jsonb := '{}'::jsonb;
  v_cache_lim jsonb := '{}'::jsonb;
  v_lkey text;
  v_entry jsonb;
  v_limite int;
  v_snap jsonb;
  v_k text;
  v_v jsonb;
  v_conflito_ids uuid[];
  v_ocupadas date[];
  v_folga_id uuid;
  v_ult date;
  v_dias_col int[];
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

  -- Sem trava cega de "concluída": cada execução reavalia quem ainda está sem
  -- folga (novos admitidos, folgas removidas). Quem já tem folga não é tocado.
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

  -- Só datas futuras: no mês corrente começa amanhã; meses futuros, o mês todo.
  v_ini_cand := GREATEST(v_comp, v_hoje + 1);

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
    SELECT c.id, c.cargo_id, c.unidade_id, c.nome, c.data_admissao
      FROM public.dp_colaboradores c
     WHERE c.company_id = _company
       AND c.deleted_at IS NULL
       AND c.ativo IS NOT false
       AND (_unidade IS NULL OR c.unidade_id = _unidade)
     ORDER BY c.nome
  LOOP
    EXIT WHEN v_ini_cand > v_fim;

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

    -- Dias de descanso que a pessoa de fato trabalha (ex.: só sábado numa
    -- unidade com sábado e domingo negociados): folga em dia já livre não vale.
    SELECT array_agg(dd.dow::int ORDER BY dd.dow) INTO v_dias_col
      FROM public.dp_colaborador_config_dias dd
     WHERE dd.trabalha IS TRUE
       AND dd.dow::int = ANY (v_dias)
       AND dd.config_id = (
             SELECT t.id FROM public.dp_colaborador_config_trabalho t
              WHERE t.colaborador_id = v_colab.id AND t.company_id = _company AND t.vigencia_fim IS NULL
              ORDER BY t.vigencia_inicio DESC NULLS LAST LIMIT 1);
    IF v_dias_col IS NULL OR array_length(v_dias_col, 1) IS NULL THEN
      v_dias_col := v_dias;
    END IF;

    v_ja := public.dp_folga_marcadas_no_mes(_company, v_colab.id, v_comp, v_dias);
    v_faltam := v_exigidas - COALESCE(v_ja, 0);
    IF v_faltam <= 0 THEN
      CONTINUE;
    END IF;

    -- Contrato vigente: não antes da admissão nem depois do último comparecimento
    -- de um desligamento em andamento.
    v_ini_col := GREATEST(v_ini_cand, COALESCE(v_colab.data_admissao, v_ini_cand));
    SELECT min(p.ultimo_comparecimento) INTO v_ult
      FROM public.dp_desligamento_processos p
     WHERE p.colaborador_id = v_colab.id
       AND p.status::text NOT IN ('cancelado', 'cancelada')
       AND p.ultimo_comparecimento IS NOT NULL
       AND (v_colab.data_admissao IS NULL OR p.ultimo_comparecimento >= v_colab.data_admissao);
    v_fim_col := LEAST(v_fim, COALESCE(v_ult, v_fim));
    IF v_ini_col > v_fim_col THEN
      CONTINUE;
    END IF;

    SELECT COALESCE(array_agg(f.data), ARRAY[]::date[])
      INTO v_ocupadas
      FROM public.dp_folgas f
     WHERE f.colaborador_id = v_colab.id
       AND f.data BETWEEN v_comp AND v_fim
       AND f.status <> 'cancelada';

    WHILE v_faltam > 0 LOOP
      v_escolhida := NULL;
      v_contingencia := false;
      v_melhor_ocupacao := NULL;
      v_cont_data := NULL;
      v_cont_ocup := NULL;
      v_conflitou := false;
      v_bloqueou := false;

      -- Do fim para o começo do mês: (1) dias vazios, (2) menor ocupação com
      -- vaga; (3) contingência: tudo lotado → menor ocupação acima do limite,
      -- começando pelos últimos dias. Ninguém fica sem folga.
      FOR v_data IN
        SELECT d::date FROM generate_series(v_ini_col, v_fim_col, interval '1 day') AS d
         WHERE EXTRACT(DOW FROM d)::int = ANY (v_dias_col)
         ORDER BY d DESC
      LOOP
        IF v_data = ANY (v_ocupadas) THEN
          CONTINUE;
        END IF;

        IF EXISTS (SELECT 1 FROM public.dp_ferias_gozos g
                    WHERE g.colaborador_id = v_colab.id
                      AND g.status::text <> 'cancelado'
                      AND v_data BETWEEN g.data_inicio AND g.data_fim) THEN
          CONTINUE;
        END IF;

        IF private.dp_folga_data_bloqueada_colab(v_colab.id, v_data) THEN
          v_bloqueou := true;
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
          IF v_cont_ocup IS NULL OR v_ocupacao < v_cont_ocup THEN
            v_cont_ocup := v_ocupacao;
            v_cont_data := v_data;
          END IF;
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

      IF v_escolhida IS NULL AND v_cont_data IS NOT NULL THEN
        v_escolhida := v_cont_data;
        v_contingencia := true;
      END IF;

      IF v_escolhida IS NULL THEN
        v_detalhes := v_detalhes || jsonb_build_object(
          'colaborador_id', v_colab.id,
          'colaborador_nome', v_colab.nome,
          'unidade_id', v_colab.unidade_id,
          'competencia', v_comp,
          'motivo', CASE
                      WHEN v_conflitou THEN 'SEM_DIA_SEM_CONFLITO'
                      WHEN v_bloqueou THEN 'SEM_DIA_SEM_BLOQUEIO'
                      ELSE 'SEM_DIA_DISPONIVEL' END);
        INSERT INTO public.dp_notificacoes(company_id, tipo, titulo, descricao, ref_table, ref_id, para_admins, chave)
        VALUES (_company, 'folga_pendentes_gestor'::public.dp_notificacao_tipo,
          'Folga de fim de semana sem data possível',
          format('Não foi possível definir automaticamente a folga de fim de semana de %s em %s (datas restantes bloqueadas ou incompatíveis). Defina a folga manualmente.',
                 v_colab.nome, to_char(v_comp, 'MM/YYYY')),
          'dp_colaboradores', v_colab.id, true,
          'folga_auto_sem_dia|' || v_colab.id::text || '|' || v_comp::text)
        ON CONFLICT (chave) WHERE chave IS NOT NULL DO NOTHING;
        EXIT;
      END IF;

      BEGIN
        IF v_contingencia THEN
          PERFORM set_config('dp.folga_auto_contingencia', 'on', true);
        END IF;
        INSERT INTO public.dp_folgas(
          company_id, colaborador_id, data, tipo, origem, status, extra, observacao)
        VALUES (_company, v_colab.id, v_escolhida, 'normal',
                'auto_fechamento_periodo', 'agendada', false,
                CASE WHEN v_contingencia
                  THEN 'Folga definida automaticamente acima do limite do dia, pois não havia outra data de fim de semana disponível no mês.'
                  ELSE 'Folga definida automaticamente no fechamento do período de escolha.' END)
        RETURNING id INTO v_folga_id;
        PERFORM set_config('dp.folga_auto_contingencia', 'off', true);
      EXCEPTION WHEN check_violation OR raise_exception THEN
        PERFORM set_config('dp.folga_auto_contingencia', 'off', true);
        v_detalhes := v_detalhes || jsonb_build_object(
          'colaborador_id', v_colab.id, 'colaborador_nome', v_colab.nome,
          'unidade_id', v_colab.unidade_id, 'competencia', v_comp,
          'data', v_escolhida, 'motivo', 'VALIDACAO_RECUSOU', 'erro', SQLERRM);
        -- tenta outra data na próxima volta
        v_ocupadas := v_ocupadas || v_escolhida;
        CONTINUE;
      END;

      v_ocupadas := v_ocupadas || v_escolhida;

      IF v_contingencia THEN
        v_excedidas := v_excedidas + 1;
        v_detalhes := v_detalhes || jsonb_build_object(
          'colaborador_id', v_colab.id, 'colaborador_nome', v_colab.nome,
          'unidade_id', v_colab.unidade_id, 'competencia', v_comp,
          'data', v_escolhida, 'motivo', 'CONTINGENCIA_ACIMA_DO_LIMITE');
        INSERT INTO public.dp_notificacoes(company_id, tipo, titulo, descricao, ref_table, ref_id, para_admins, chave)
        VALUES (_company, 'folga_acima_limite'::public.dp_notificacao_tipo,
          'Atenção à cobertura: folga acima do limite',
          format('%s recebeu folga automática em %s acima do limite de vagas, pois todos os fins de semana restantes do mês estavam lotados. Verifique a escala do dia.',
                 v_colab.nome, to_char(v_escolhida, 'DD/MM/YYYY')),
          'dp_folgas', v_folga_id, true, 'folga_auto_contingencia|' || v_folga_id::text)
        ON CONFLICT (chave) WHERE chave IS NOT NULL DO NOTHING;
      END IF;

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
         quantidade_gerada = COALESCE(quantidade_gerada, 0) + v_geradas,
         quantidade_excedida = COALESCE(quantidade_excedida, 0) + v_excedidas,
         detalhes = v_detalhes
   WHERE id = v_exec_id;

  RETURN jsonb_build_object(
    'ok', true, 'execucao_id', v_exec_id, 'geradas', v_geradas,
    'excedidas', v_excedidas, 'competencia', v_comp, 'pendencias', v_detalhes);
END;
$function$;