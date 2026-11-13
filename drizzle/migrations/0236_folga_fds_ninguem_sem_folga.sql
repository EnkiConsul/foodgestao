-- Folgas de fim de semana: ninguém fica sem folga.
-- 1) Elegibilidade respeita os dias negociados da unidade (sábado e/ou domingo).
-- 2) Distribuição automática reavalia o mês corrente todos os dias (novos
--    admitidos e quem ficou sem folga), só em datas futuras, e usa contingência
--    acima do limite começando pelos últimos dias do mês, com aviso ao gestor.
-- 3) Portal: quem ainda não tem folga de fim de semana no mês corrente pode
--    marcar uma data futura desse mês mesmo com a escolha do mês seguinte aberta.

CREATE OR REPLACE FUNCTION public.dp_folga_exige_descanso_fds(_company uuid, _colab uuid, _dias integer[], _competencia date)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_c record;
  v_cfg_id uuid;
  v_fixa int;
  v_dias_trab int[];
  v_dias_uso int[] := COALESCE(_dias, '{}'::int[]);
  v_ini date := date_trunc('month', COALESCE(_competencia, now()::date))::date;
  v_fim date := (date_trunc('month', COALESCE(_competencia, now()::date)) + interval '1 month - 1 day')::date;
BEGIN
  IF _company IS NULL OR _colab IS NULL THEN RETURN false; END IF;

  SELECT c.id, c.regime, c.vinculo_label, c.unidade_id, c.forma_pagamento
    INTO v_c
    FROM public.dp_colaboradores c
   WHERE c.id = _colab AND c.company_id = _company
     AND c.deleted_at IS NULL AND c.ativo IS NOT false;

  IF v_c.id IS NULL THEN RETURN false; END IF;

  -- CLT e freelancer mensalista (trabalha o mês todo) seguem a regra; demais vínculos não
  IF v_c.regime IS NOT NULL AND v_c.regime::text <> 'clt'
     AND NOT (v_c.regime::text = 'freelancer' AND COALESCE(v_c.forma_pagamento::text, '') = 'mensalista') THEN
    RETURN false;
  END IF;

  IF lower(COALESCE(v_c.vinculo_label, '')) IN ('socio', 'sócio') THEN RETURN false; END IF;

  SELECT t.id, t.folga_fixa_dow INTO v_cfg_id, v_fixa
    FROM public.dp_colaborador_config_trabalho t
   WHERE t.colaborador_id = _colab
     AND t.company_id = _company
     AND t.vigencia_fim IS NULL
   ORDER BY t.vigencia_inicio DESC NULLS LAST
   LIMIT 1;

  IF v_cfg_id IS NOT NULL THEN
    -- 12x36 não escolhe folga: o ciclo de 48h já alterna domingos de descanso (Art. 59-A CLT).
    IF EXISTS (SELECT 1 FROM public.dp_colaborador_config_trabalho t WHERE t.id = v_cfg_id AND t.escala_modelo = '12x36') THEN RETURN false; END IF;
    IF v_fixa = 0 THEN RETURN false; END IF;

    SELECT array_agg(d.dow ORDER BY d.dow) INTO v_dias_trab
      FROM public.dp_colaborador_config_dias d
     WHERE d.config_id = v_cfg_id AND d.trabalha IS TRUE;

    IF v_dias_trab IS NOT NULL AND array_length(v_dias_trab, 1) IS NOT NULL THEN
      IF array_length(v_dias_uso, 1) IS NULL THEN
        -- Sem dias informados vale o domingo.
        IF NOT (0 = ANY (v_dias_trab)) THEN RETURN false; END IF;
      ELSIF NOT EXISTS (SELECT 1 FROM unnest(v_dias_uso) AS x WHERE x = ANY (v_dias_trab)) THEN
        -- Precisa trabalhar em ao menos um dos dias de descanso da unidade
        -- (sábado e/ou domingo, conforme o acordo).
        RETURN false;
      END IF;
    END IF;
  END IF;

  IF array_length(v_dias_uso, 1) IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.dp_ferias_gozos g
       WHERE g.colaborador_id = _colab
         AND g.status::text <> 'cancelado'
         AND g.data_inicio <= v_fim AND g.data_fim >= v_ini
    ) OR EXISTS (
      SELECT 1 FROM public.dp_folgas f
       WHERE f.colaborador_id = _colab
         AND f.status::text <> 'cancelada'
         AND f.tipo::text IN ('ferias', 'licenca')
         AND f.data BETWEEN v_ini AND v_fim
    ) THEN RETURN false; END IF;

    RETURN true;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM generate_series(v_ini, v_fim, interval '1 day') AS d
     WHERE EXTRACT(DOW FROM d)::int = ANY (v_dias_uso)
       AND NOT EXISTS (
         SELECT 1 FROM public.dp_ferias_gozos g
          WHERE g.colaborador_id = _colab
            AND g.status::text <> 'cancelado'
            AND d::date BETWEEN g.data_inicio AND g.data_fim)
       AND NOT EXISTS (
         SELECT 1 FROM public.dp_folgas f
          WHERE f.colaborador_id = _colab
            AND f.status::text <> 'cancelada'
            AND f.tipo::text IN ('ferias', 'licenca')
            AND f.data = d::date)
  ) THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$function$;

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
         WHERE EXTRACT(DOW FROM d)::int = ANY (v_dias)
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

CREATE OR REPLACE FUNCTION public.dp_folga_autoatribuir_todas(p_limite_alvos integer DEFAULT 2)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_alvo record; v_janela jsonb;
  v_processadas int := 0; v_geradas int := 0; v_pendentes int := 0;
  v_reavaliadas int := 0;
  v_limite int := GREATEST(COALESCE(p_limite_alvos, 2), 1);
  v_res jsonb;
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_mes_atual date := date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo'))::date;
BEGIN
  -- 1) Fechamento da escolha do mês seguinte (D+2 do encerramento).
  FOR v_alvo IN SELECT DISTINCT c.company_id, c.unidade_id FROM public.dp_colaboradores c WHERE c.deleted_at IS NULL AND c.ativo IS NOT false LOOP
    v_janela := public.dp_folgas_janela_efetiva(v_alvo.company_id, v_alvo.unidade_id, NULL);
    CONTINUE WHEN NOT COALESCE((v_janela->>'ativa')::boolean, false);
    CONTINUE WHEN NOT COALESCE((v_janela->>'autoatribuir')::boolean, false);
    CONTINUE WHEN (v_janela->>'estado') <> 'encerrada';
    CONTINUE WHEN (v_janela->>'hoje')::date < (v_janela->>'fecha_em')::date + 2;
    IF EXISTS (SELECT 1 FROM public.dp_folga_autoatribuicao_execucoes e
       WHERE e.company_id = v_alvo.company_id
         AND COALESCE(e.unidade_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(v_alvo.unidade_id, '00000000-0000-0000-0000-000000000000'::uuid)
         AND e.competencia = (v_janela->>'competencia')::date AND e.status = 'concluida') THEN
      CONTINUE;
    END IF;
    IF v_processadas >= v_limite THEN v_pendentes := v_pendentes + 1; CONTINUE; END IF;
    BEGIN
      v_res := public.dp_folga_autoatribuir_competencia(v_alvo.company_id, v_alvo.unidade_id, (v_janela->>'competencia')::date);
      v_processadas := v_processadas + 1;
      v_geradas := v_geradas + COALESCE((v_res->>'geradas')::int, 0);
    EXCEPTION WHEN OTHERS THEN
      v_processadas := v_processadas + 1;
      INSERT INTO public.dp_folga_autoatribuicao_execucoes(company_id, unidade_id, competencia, status, iniciada_em, erro)
      VALUES (v_alvo.company_id, v_alvo.unidade_id, (v_janela->>'competencia')::date, 'erro', now(), SQLERRM)
      ON CONFLICT (company_id, COALESCE(unidade_id, '00000000-0000-0000-0000-000000000000'::uuid), competencia)
      DO UPDATE SET status = 'erro', erro = EXCLUDED.erro, updated_at = now();
    END;
  END LOOP;

  -- 2) Reavaliação diária do mês corrente: quem entrou depois do fechamento ou
  --    ficou sem folga de fim de semana recebe uma data futura do mês.
  FOR v_alvo IN SELECT DISTINCT c.company_id, c.unidade_id FROM public.dp_colaboradores c WHERE c.deleted_at IS NULL AND c.ativo IS NOT false LOOP
    v_janela := public.dp_folgas_janela_efetiva(v_alvo.company_id, v_alvo.unidade_id, NULL);
    CONTINUE WHEN NOT COALESCE((v_janela->>'ativa')::boolean, false);
    CONTINUE WHEN NOT COALESCE((v_janela->>'autoatribuir')::boolean, false);
    IF EXISTS (SELECT 1 FROM public.dp_folga_autoatribuicao_execucoes e
       WHERE e.company_id = v_alvo.company_id
         AND COALESCE(e.unidade_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(v_alvo.unidade_id, '00000000-0000-0000-0000-000000000000'::uuid)
         AND e.competencia = v_mes_atual
         AND e.status = 'concluida'
         AND (e.concluida_em AT TIME ZONE 'America/Sao_Paulo')::date = v_hoje) THEN
      CONTINUE;
    END IF;
    IF v_reavaliadas >= v_limite THEN v_pendentes := v_pendentes + 1; CONTINUE; END IF;
    BEGIN
      v_res := public.dp_folga_autoatribuir_competencia(v_alvo.company_id, v_alvo.unidade_id, v_mes_atual);
      v_reavaliadas := v_reavaliadas + 1;
      v_geradas := v_geradas + COALESCE((v_res->>'geradas')::int, 0);
    EXCEPTION WHEN OTHERS THEN
      v_reavaliadas := v_reavaliadas + 1;
      INSERT INTO public.dp_folga_autoatribuicao_execucoes(company_id, unidade_id, competencia, status, iniciada_em, erro)
      VALUES (v_alvo.company_id, v_alvo.unidade_id, v_mes_atual, 'erro', now(), SQLERRM)
      ON CONFLICT (company_id, COALESCE(unidade_id, '00000000-0000-0000-0000-000000000000'::uuid), competencia)
      DO UPDATE SET status = 'erro', erro = EXCLUDED.erro, updated_at = now();
    END;
  END LOOP;

  RETURN jsonb_build_object('processadas', v_processadas, 'reavaliadas', v_reavaliadas,
    'geradas', v_geradas, 'pendentes', v_pendentes);
END;
$function$;

CREATE OR REPLACE FUNCTION public.dp_folga_marcar(p_data date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_colab uuid; v_company uuid; v_unidade uuid; v_cargo uuid; v_setor uuid; v_nome text;
  v_janela jsonb; v_estado text; v_lim jsonb; v_conf jsonb; v_id uuid;
  v_salvaguarda boolean := false; v_fds boolean; d date; v_alternativa boolean := false;
  v_ini date; v_fim date;
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_dias int[]; v_exigidas int; v_direito_mes boolean := false; v_restricao boolean := false;
BEGIN
  PERFORM private.dp_folga_portal_exigir_liberada();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;
  IF p_data IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe a data.' USING ERRCODE = '22023';
  END IF;

  v_colab := public.dp_colaborador_ativo_of(v_uid);
  IF v_colab IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: cadastro de colaborador não encontrado.' USING ERRCODE = '42501';
  END IF;

  SELECT c.company_id, c.unidade_id, c.cargo_id, c.setor_id, COALESCE(c.nome_social, c.nome)
    INTO v_company, v_unidade, v_cargo, v_setor, v_nome
    FROM public.dp_colaboradores c WHERE c.id = v_colab;

  IF p_data < CURRENT_DATE THEN
    RAISE EXCEPTION 'PAST_DATE_NOT_EDITABLE: datas passadas não podem ser marcadas.' USING ERRCODE = '22023';
  END IF;

  v_janela := public.dp_folgas_janela_efetiva(v_company, v_unidade, NULL);

  -- Direito do mês corrente: quem ainda não tem a folga de fim de semana do mês
  -- em curso pode marcá-la (datas futuras), mesmo com a escolha do mês seguinte
  -- aberta ou ainda por abrir. Ninguém fica sem folga.
  IF date_trunc('month', p_data) = date_trunc('month', v_hoje) THEN
    v_dias := public.dp_folga_dias_fds_aplicaveis(v_company, v_unidade);
    v_exigidas := COALESCE((v_janela->>'folgas_exigidas')::int, 1);
    v_direito_mes := v_exigidas > 0
      AND EXTRACT(DOW FROM p_data)::int = ANY (COALESCE(v_dias, ARRAY[0]))
      AND public.dp_folga_marcadas_no_mes(v_company, v_colab, p_data, v_dias) < v_exigidas
      AND public.dp_folga_exige_descanso_fds(v_company, v_colab, v_dias, p_data);
  END IF;

  IF COALESCE((v_janela->>'ativa')::boolean, false) AND NOT v_direito_mes THEN
    v_estado := v_janela->>'estado';
    IF v_estado = 'antes' THEN
      RAISE EXCEPTION 'FOLGA_FORA_DA_JANELA: o período de escolha das folgas ainda não abriu.' USING ERRCODE = 'check_violation';
    END IF;
    IF v_estado = 'aberta'
       AND date_trunc('month', p_data) <> date_trunc('month', (v_janela->>'competencia')::date) THEN
      RAISE EXCEPTION 'FOLGA_FORA_DA_JANELA: fora do período de escolha das folgas.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_company::text || '|folga_dia|' || COALESCE(v_unidade::text, 'sem') || '|' || p_data::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(v_colab::text || '|folga_self|' || p_data::text, 0));

  IF EXISTS (SELECT 1 FROM public.dp_folgas f
              WHERE f.colaborador_id = v_colab AND f.data = p_data AND f.status <> 'cancelada') THEN
    RAISE EXCEPTION 'DUPLICATE_REQUEST: você já tem folga marcada neste dia.' USING ERRCODE = '22023';
  END IF;

  v_lim := public.dp_folga_limite_dia(v_company, v_unidade, v_cargo, p_data, NULL, v_setor);
  IF COALESCE((v_lim->>'excedido')::boolean, false) THEN
    -- Salvaguarda: quem tem restrição no mês, ou ainda está sem a folga do mês
    -- corrente, não fica sem folga quando não há outra data livre.
    v_restricao := private.dp_colab_tem_restricao_mes(v_colab, p_data);
    IF (v_restricao OR v_direito_mes)
       AND NOT private.dp_folga_data_bloqueada_colab(v_colab, p_data) THEN
      v_fds := EXTRACT(DOW FROM p_data) IN (0, 6);
      v_ini := GREATEST(date_trunc('month', p_data)::date, CURRENT_DATE);
      v_fim := (date_trunc('month', p_data) + interval '1 month' - interval '1 day')::date;
      d := v_ini;
      WHILE d <= v_fim AND NOT v_alternativa LOOP
        IF d <> p_data
           AND (CASE WHEN v_direito_mes THEN EXTRACT(DOW FROM d)::int = ANY (v_dias)
                     ELSE (EXTRACT(DOW FROM d) IN (0, 6)) = v_fds END)
           AND NOT EXISTS (SELECT 1 FROM public.dp_folgas f
                            WHERE f.colaborador_id = v_colab AND f.data = d AND f.status <> 'cancelada')
           AND NOT private.dp_folga_data_bloqueada_colab(v_colab, d)
           AND NOT COALESCE((public.dp_folga_limite_dia(v_company, v_unidade, v_cargo, d, NULL, v_setor)->>'excedido')::boolean, false) THEN
          v_alternativa := true;
        END IF;
        d := d + 1;
      END LOOP;
      IF NOT v_alternativa THEN v_salvaguarda := true; END IF;
    END IF;
    IF NOT v_salvaguarda THEN
      RAISE EXCEPTION 'FOLGA_LIMITE_DIA: este dia já atingiu o limite de pessoas em folga.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  v_conf := public.dp_folga_conflito_colaboradores(v_company, v_colab, p_data);
  IF COALESCE((v_conf->>'conflito')::boolean, false) THEN
    RAISE EXCEPTION 'FOLGA_INCOMPATIBILIDADE: % já está de folga neste dia e vocês não podem folgar juntos.',
      COALESCE(v_conf->>'colega_nome', 'Outra pessoa') USING ERRCODE = 'check_violation';
  END IF;

  IF v_salvaguarda THEN
    PERFORM set_config('dp.folga_excedente_autorizado', 'on', true);
  END IF;

  INSERT INTO public.dp_folgas(company_id, colaborador_id, data, tipo, origem, status, extra, criado_por)
  VALUES (v_company, v_colab, p_data, 'normal', 'solicitacao', 'agendada', false, v_uid)
  RETURNING id INTO v_id;

  IF v_salvaguarda THEN
    PERFORM set_config('dp.folga_excedente_autorizado', 'off', true);
    INSERT INTO public.dp_notificacoes(company_id, tipo, titulo, descricao, ref_table, ref_id, para_admins, chave)
    VALUES (v_company, 'folga_acima_limite'::public.dp_notificacao_tipo,
      'Atenção à cobertura: folga acima do limite',
      format('%s agendou folga em %s acima do limite de vagas da unidade, pois não havia outra data disponível para essa pessoa no mês. Verifique a escala do dia.',
             v_nome, to_char(p_data, 'DD/MM/YYYY')),
      'dp_folgas', v_id, true, 'folga_salvaguarda|' || v_id::text);
  END IF;

  RETURN jsonb_build_object('ok', true, 'folga_id', v_id, 'limite', v_lim, 'mes_corrente', v_direito_mes);
END;
$function$;