-- 1) Helpers: folga já marcada (dp_folgas + solicitação aprovada)
CREATE OR REPLACE FUNCTION public.dp_folga_ocupado_no_dia(_company uuid, _colab uuid, _data date)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.dp_folgas f
     WHERE f.colaborador_id = _colab AND f.data = _data AND f.status <> 'cancelada'
  ) OR EXISTS (
    SELECT 1 FROM public.dp_solicitacoes s
     WHERE s.company_id = _company AND s.colaborador_id = _colab
       AND s.tipo = 'folga' AND s.status = 'aprovada' AND s.data_alvo = _data
  );
$$;

CREATE OR REPLACE FUNCTION public.dp_folga_marcadas_no_mes(
  _company uuid, _colab uuid, _competencia date, _dias int[])
RETURNS int
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH lim AS (
    SELECT date_trunc('month', _competencia)::date AS ini,
           (date_trunc('month', _competencia) + interval '1 month - 1 day')::date AS fim
  ), datas AS (
    SELECT f.data FROM public.dp_folgas f, lim
     WHERE f.colaborador_id = _colab
       AND f.data BETWEEN lim.ini AND lim.fim
       AND f.status <> 'cancelada'
       AND f.extra = false
       AND f.tipo NOT IN ('ferias', 'licenca')
       AND EXTRACT(DOW FROM f.data)::int = ANY (_dias)
    UNION
    SELECT s.data_alvo FROM public.dp_solicitacoes s, lim
     WHERE s.company_id = _company
       AND s.colaborador_id = _colab
       AND s.tipo = 'folga'
       AND s.status = 'aprovada'
       AND s.data_alvo BETWEEN lim.ini AND lim.fim
       AND EXTRACT(DOW FROM s.data_alvo)::int = ANY (_dias)
  )
  SELECT count(*)::int FROM datas;
$$;

GRANT EXECUTE ON FUNCTION public.dp_folga_ocupado_no_dia(uuid, uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dp_folga_marcadas_no_mes(uuid, uuid, date, int[]) TO authenticated, service_role;

-- 2) Prévia passa a considerar pedidos aprovados
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
BEGIN
  IF _company IS NULL OR _competencia IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: empresa e competência obrigatórias.' USING ERRCODE = '22023';
  END IF;
  IF NOT private.is_company_admin_or_owner(auth.uid(), _company) THEN
    RAISE EXCEPTION 'FORBIDDEN: acesso restrito a administradores da empresa.' USING ERRCODE = '42501';
  END IF;

  v_comp := date_trunc('month', _competencia)::date;
  v_dias := public.dp_folga_dias_fds_aplicaveis(_company, _unidade);
  SELECT COALESCE((public.dp_folgas_janela_efetiva(_company, _unidade, NULL)->>'folgas_exigidas')::int, 1)
    INTO v_exigidas;

  IF v_exigidas IS NULL OR v_exigidas <= 0 OR v_dias IS NULL OR array_length(v_dias, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'competencia', v_comp, 'elegiveis', 0, 'sem_folga', 0,
      'a_criar', 0, 'folgas_exigidas', COALESCE(v_exigidas, 0), 'dias', COALESCE(v_dias, '{}'::int[]));
  END IF;

  FOR v_colab IN
    SELECT c.id
      FROM public.dp_colaboradores c
     WHERE c.company_id = _company
       AND c.deleted_at IS NULL
       AND c.ativo IS NOT false
       AND (_unidade IS NULL OR c.unidade_id = _unidade)
       AND lower(COALESCE(c.vinculo_label, '')) NOT IN ('socio', 'sócio')
  LOOP
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
    'folgas_exigidas', v_exigidas,
    'dias', v_dias);
END;
$function$;

-- 3) Plano (dry-run) com o dia sugerido por colaborador
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
  v_plan jsonb := '{}'::jsonb;            -- data -> quantidade planejada
  v_planejados jsonb := '[]'::jsonb;      -- [{colaborador_id, data}]
  v_itens jsonb := '[]'::jsonb;
  v_elegiveis int := 0;
BEGIN
  IF _company IS NULL OR _competencia IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: empresa e competência obrigatórias.' USING ERRCODE = '22023';
  END IF;
  IF NOT private.is_company_admin_or_owner(auth.uid(), _company) THEN
    RAISE EXCEPTION 'FORBIDDEN: acesso restrito a administradores da empresa.' USING ERRCODE = '42501';
  END IF;

  v_comp := date_trunc('month', _competencia)::date;
  v_fim := (date_trunc('month', _competencia) + interval '1 month - 1 day')::date;
  v_dias := public.dp_folga_dias_fds_aplicaveis(_company, _unidade);
  SELECT COALESCE((public.dp_folgas_janela_efetiva(_company, _unidade, NULL)->>'folgas_exigidas')::int, 1)
    INTO v_exigidas;

  IF v_exigidas IS NULL OR v_exigidas <= 0 OR v_dias IS NULL OR array_length(v_dias, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'competencia', v_comp, 'dias', COALESCE(v_dias, '{}'::int[]),
      'folgas_exigidas', COALESCE(v_exigidas, 0), 'elegiveis', 0, 'itens', '[]'::jsonb);
  END IF;

  FOR v_colab IN
    SELECT c.id, c.nome, c.cargo_id, c.unidade_id
      FROM public.dp_colaboradores c
     WHERE c.company_id = _company
       AND c.deleted_at IS NULL
       AND c.ativo IS NOT false
       AND (_unidade IS NULL OR c.unidade_id = _unidade)
       AND lower(COALESCE(c.vinculo_label, '')) NOT IN ('socio', 'sócio')
     ORDER BY c.nome
  LOOP
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

        -- conflito com colegas já planejados nesta simulação
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
    'dias', v_dias,
    'folgas_exigidas', v_exigidas,
    'elegiveis', v_elegiveis,
    'itens', v_itens);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.dp_folga_autoatribuicao_plano(uuid, uuid, date) TO authenticated, service_role;

-- 4) Aplicar apenas os itens confirmados pelo gestor
CREATE OR REPLACE FUNCTION public.dp_folga_autoatribuir_aplicar(
  _company uuid, _unidade uuid, _competencia date, _itens jsonb)
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
  v_limite int;
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

  v_dias := public.dp_folga_dias_fds_aplicaveis(_company, _unidade);

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
    v_limite := NULLIF(v_lim->>'limite', '')::int;
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

GRANT EXECUTE ON FUNCTION public.dp_folga_autoatribuir_aplicar(uuid, uuid, date, jsonb) TO authenticated, service_role;