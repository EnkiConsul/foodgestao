-- Elegibilidade única para geração automática de folgas de fim de semana
CREATE OR REPLACE FUNCTION public.dp_folga_exige_descanso_fds(
  _company uuid, _colab uuid, _dias integer[], _competencia date)
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
  v_ini date := date_trunc('month', COALESCE(_competencia, now()::date))::date;
  v_fim date := (date_trunc('month', COALESCE(_competencia, now()::date)) + interval '1 month - 1 day')::date;
BEGIN
  IF _company IS NULL OR _colab IS NULL THEN RETURN false; END IF;

  SELECT c.id, c.regime, c.vinculo_label, c.unidade_id
    INTO v_c
    FROM public.dp_colaboradores c
   WHERE c.id = _colab AND c.company_id = _company
     AND c.deleted_at IS NULL AND c.ativo IS NOT false;

  IF v_c.id IS NULL THEN RETURN false; END IF;

  -- vínculos sem folga semanal a cumprir (intermitente, PJ, MEI, freelancer, estágio, temporário)
  IF v_c.regime IS NOT NULL AND v_c.regime::text <> 'clt' THEN RETURN false; END IF;

  -- sócios
  IF lower(COALESCE(v_c.vinculo_label, '')) IN ('socio', 'sócio') THEN RETURN false; END IF;

  SELECT t.id, t.folga_fixa_dow INTO v_cfg_id, v_fixa
    FROM public.dp_colaborador_config_trabalho t
   WHERE t.colaborador_id = _colab
     AND t.company_id = _company
     AND t.vigencia_fim IS NULL
   ORDER BY t.vigencia_inicio DESC NULLS LAST
   LIMIT 1;

  IF v_cfg_id IS NOT NULL THEN
    -- quem já não trabalha no domingo não precisa de folga dominical
    IF v_fixa = 0 THEN RETURN false; END IF;

    SELECT array_agg(d.dow ORDER BY d.dow) INTO v_dias_trab
      FROM public.dp_colaborador_config_dias d
     WHERE d.config_id = v_cfg_id AND d.trabalha IS TRUE;

    IF v_dias_trab IS NOT NULL AND array_length(v_dias_trab, 1) IS NOT NULL THEN
      IF NOT (0 = ANY (v_dias_trab)) THEN RETURN false; END IF;
      IF _dias IS NOT NULL AND array_length(_dias, 1) IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM unnest(_dias) AS x WHERE x = ANY (v_dias_trab)) THEN
        RETURN false;
      END IF;
    END IF;
  END IF;

  -- férias / licença cobrindo o mês
  IF EXISTS (
    SELECT 1 FROM public.dp_ferias_gozos g
     WHERE g.colaborador_id = _colab
       AND g.status::text NOT IN ('cancelado')
       AND g.data_inicio <= v_fim AND g.data_fim >= v_ini
  ) THEN RETURN false; END IF;

  IF EXISTS (
    SELECT 1 FROM public.dp_folgas f
     WHERE f.colaborador_id = _colab
       AND f.status::text <> 'cancelada'
       AND f.tipo::text IN ('ferias', 'licenca')
       AND f.data BETWEEN v_ini AND v_fim
  ) THEN RETURN false; END IF;

  RETURN true;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.dp_folga_exige_descanso_fds(uuid, uuid, integer[], date) TO authenticated, service_role;

-- Plano: regra resolvida pela unidade de cada colaborador + elegibilidade
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
  v_contingencia boolean;
  v_excede boolean;
  v_key text;
  v_cache_dias jsonb := '{}'::jsonb;
  v_cache_exig jsonb := '{}'::jsonb;
  v_plan jsonb := '{}'::jsonb;
  v_planejados jsonb := '[]'::jsonb;
  v_itens jsonb := '[]'::jsonb;
  v_elegiveis int := 0;
  v_dias_base int[];
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

    WHILE v_faltam > 0 LOOP
      v_escolhida := NULL;
      v_melhor := NULL;
      v_conflitou := false;
      v_contingencia := false;

      FOR v_data IN
        SELECT d::date FROM generate_series(v_comp, v_fim, interval '1 day') AS d
         WHERE EXTRACT(DOW FROM d)::int = ANY (v_dias)
         ORDER BY d
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

        IF v_limite IS NOT NULL AND v_ocupacao >= v_limite THEN CONTINUE; END IF;

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
        v_contingencia := true;
        SELECT d::date INTO v_escolhida
          FROM generate_series(v_comp, v_fim, interval '1 day') AS d
         WHERE EXTRACT(DOW FROM d)::int = ANY (v_dias)
           AND NOT public.dp_folga_ocupado_no_dia(_company, v_colab.id, d::date)
           AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_planejados) p
                            WHERE (p->>'colaborador_id')::uuid = v_colab.id
                              AND (p->>'data')::date = d::date)
           AND NOT COALESCE((public.dp_folga_conflito_colaboradores(
                 _company, v_colab.id, d::date)->>'conflito')::boolean, false)
         ORDER BY d DESC
         LIMIT 1;
      END IF;

      IF v_escolhida IS NULL THEN
        v_itens := v_itens || jsonb_build_object(
          'colaborador_id', v_colab.id,
          'colaborador_nome', v_colab.nome,
          'unidade_id', v_colab.unidade_id,
          'data_sugerida', NULL,
          'excede_limite', false,
          'motivo', CASE WHEN v_conflitou THEN 'SEM_DIA_SEM_CONFLITO' ELSE 'SEM_DIA_DISPONIVEL' END);
        EXIT;
      END IF;

      v_lim := public.dp_folga_limite_dia(_company, v_colab.unidade_id, v_colab.cargo_id, v_escolhida, NULL);
      v_limite := NULLIF(v_lim->>'limite', '')::int;
      v_ocupacao := COALESCE((v_lim->>'em_folga')::int, 0)
                    + COALESCE((v_plan->>to_char(v_escolhida, 'YYYY-MM-DD'))::int, 0);
      v_excede := v_limite IS NOT NULL AND v_ocupacao >= v_limite;

      v_itens := v_itens || jsonb_build_object(
        'colaborador_id', v_colab.id,
        'colaborador_nome', v_colab.nome,
        'unidade_id', v_colab.unidade_id,
        'data_sugerida', v_escolhida,
        'excede_limite', v_excede,
        'motivo', CASE WHEN v_contingencia THEN 'CONTINGENCIA_FIM_DO_MES' ELSE NULL END);

      v_planejados := v_planejados || jsonb_build_object(
        'colaborador_id', v_colab.id, 'data', v_escolhida);
      v_plan := jsonb_set(
        v_plan, ARRAY[to_char(v_escolhida, 'YYYY-MM-DD')],
        to_jsonb(COALESCE((v_plan->>to_char(v_escolhida, 'YYYY-MM-DD'))::int, 0) + 1), true);

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

-- Prévia
CREATE OR REPLACE FUNCTION public.dp_folga_autoatribuicao_previa(_company uuid, _unidade uuid, _competencia date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_comp date;
  v_dias int[];
  v_exigidas int;
  v_sem_folga int := 0;
  v_a_criar int := 0;
  v_elegiveis int := 0;
  v_colab record;
  v_ja int;
  v_faltam int;
  v_key text;
  v_cache_dias jsonb := '{}'::jsonb;
  v_cache_exig jsonb := '{}'::jsonb;
BEGIN
  IF _company IS NULL OR _competencia IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: empresa e competência obrigatórias.' USING ERRCODE = '22023';
  END IF;
  IF NOT private.is_company_admin_or_owner(auth.uid(), _company) THEN
    RAISE EXCEPTION 'FORBIDDEN: acesso restrito a administradores da empresa.' USING ERRCODE = '42501';
  END IF;

  v_comp := date_trunc('month', _competencia)::date;

  FOR v_colab IN
    SELECT c.id, c.unidade_id
      FROM public.dp_colaboradores c
     WHERE c.company_id = _company
       AND c.deleted_at IS NULL
       AND c.ativo IS NOT false
       AND (_unidade IS NULL OR c.unidade_id = _unidade)
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
    IF v_faltam > 0 THEN
      v_sem_folga := v_sem_folga + 1;
      v_a_criar := v_a_criar + v_faltam;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'competencia', v_comp,
    'elegiveis', v_elegiveis,
    'sem_folga', v_sem_folga,
    'a_criar', v_a_criar,
    'folgas_exigidas', COALESCE((public.dp_folgas_janela_efetiva(_company, _unidade, NULL)->>'folgas_exigidas')::int, 1),
    'dias', COALESCE(public.dp_folga_dias_fds_aplicaveis(_company, _unidade), '{}'::int[]));
END;
$function$;

-- Aplicar itens confirmados pelo gestor
CREATE OR REPLACE FUNCTION public.dp_folga_autoatribuir_aplicar(_company uuid, _unidade uuid, _competencia date, _itens jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

    IF public.dp_folga_ocupado_no_dia(_company, v_colab.id, v_data)
       OR public.dp_folga_marcadas_no_mes(_company, v_colab.id, v_comp, v_dias) > 0 THEN
      v_ignoradas := v_ignoradas || jsonb_build_object(
        'colaborador_id', v_colab.id, 'colaborador_nome', v_colab.nome,
        'data', v_data, 'motivo', 'JA_TEM_FOLGA');
      CONTINUE;
    END IF;

    v_lim := public.dp_folga_limite_dia(_company, v_colab.unidade_id, v_colab.cargo_id, v_data, NULL);
    v_excede := COALESCE((v_lim->>'excedido')::boolean, false);

    PERFORM set_config('dp.folga_auto_contingencia', 'on', true);

    BEGIN
      INSERT INTO public.dp_folgas(
        company_id, colaborador_id, data, tipo, origem, status, extra, observacao)
      VALUES (_company, v_colab.id, v_data, 'normal',
              'auto_fechamento_periodo', 'agendada', false,
              'Folga definida automaticamente e confirmada pelo gestor.');
    EXCEPTION WHEN OTHERS THEN
      PERFORM set_config('dp.folga_auto_contingencia', 'off', true);
      v_ignoradas := v_ignoradas || jsonb_build_object(
        'colaborador_id', v_colab.id, 'colaborador_nome', v_colab.nome,
        'data', v_data, 'motivo', 'NAO_PERMITIDO');
      CONTINUE;
    END;

    PERFORM set_config('dp.folga_auto_contingencia', 'off', true);
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
$function$;

-- Execução automática da competência (pg_cron)
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
  v_melhor_ocupacao int;
  v_faltam int;
  v_geradas int := 0;
  v_excedidas int := 0;
  v_detalhes jsonb := '[]'::jsonb;
  v_contingencia boolean;
  v_ja int;
  v_conflitou boolean;
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
      v_contingencia := false;
      v_conflitou := false;

      FOR v_data IN
        SELECT d::date FROM generate_series(v_comp, v_fim, interval '1 day') AS d
         WHERE EXTRACT(DOW FROM d)::int = ANY (v_dias)
         ORDER BY d
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
          CONTINUE;
        END IF;

        IF (v_lim->>'em_folga')::int = 0 THEN
          v_escolhida := v_data;
          EXIT;
        END IF;

        IF v_melhor_ocupacao IS NULL OR (v_lim->>'em_folga')::int < v_melhor_ocupacao THEN
          v_melhor_ocupacao := (v_lim->>'em_folga')::int;
          v_escolhida := v_data;
        END IF;
      END LOOP;

      IF v_escolhida IS NULL THEN
        v_contingencia := true;
        SELECT d::date INTO v_escolhida
          FROM generate_series(v_comp, v_fim, interval '1 day') AS d
         WHERE EXTRACT(DOW FROM d)::int = ANY (v_dias)
           AND NOT EXISTS (
             SELECT 1 FROM public.dp_folgas f
              WHERE f.colaborador_id = v_colab.id AND f.data = d::date
                AND f.status <> 'cancelada')
           AND NOT COALESCE((public.dp_folga_conflito_colaboradores(
                 _company, v_colab.id, d::date)->>'conflito')::boolean, false)
         ORDER BY d DESC
         LIMIT 1;
      END IF;

      IF v_escolhida IS NULL THEN
        v_detalhes := v_detalhes || jsonb_build_object(
          'colaborador_id', v_colab.id,
          'colaborador_nome', v_colab.nome,
          'unidade_id', v_colab.unidade_id,
          'competencia', v_comp,
          'motivo', CASE WHEN v_conflitou THEN 'SEM_DIA_SEM_CONFLITO' ELSE 'SEM_DIA_DISPONIVEL' END);
        EXIT;
      END IF;

      v_lim := public.dp_folga_limite_dia(_company, v_colab.unidade_id, v_colab.cargo_id, v_escolhida, NULL);

      IF v_contingencia THEN
        PERFORM set_config('dp.folga_auto_contingencia', 'on', true);
      END IF;

      INSERT INTO public.dp_folgas(
        company_id, colaborador_id, data, tipo, origem, status, extra, observacao)
      VALUES (_company, v_colab.id, v_escolhida, 'normal',
              'auto_fechamento_periodo', 'agendada', false,
              'Folga definida automaticamente no fechamento do período de escolha.');

      IF v_contingencia THEN
        PERFORM set_config('dp.folga_auto_contingencia', 'off', true);
        v_excedidas := v_excedidas + 1;
        v_detalhes := v_detalhes || jsonb_build_object(
          'colaborador_id', v_colab.id,
          'colaborador_nome', v_colab.nome,
          'cargo_id', v_colab.cargo_id,
          'unidade_id', v_colab.unidade_id,
          'data', v_escolhida,
          'competencia', v_comp,
          'regra_id', v_lim->'regra_id',
          'limite', v_lim->'limite',
          'ocupacao_anterior', v_lim->'em_folga',
          'ocupacao_resultante', COALESCE((v_lim->>'em_folga')::int, 0) + 1,
          'motivo', 'SEM_VAGA_NO_MES');
      END IF;

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