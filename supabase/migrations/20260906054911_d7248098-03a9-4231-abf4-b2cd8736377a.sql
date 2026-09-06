-- M28: dp_convocacao_necessidade_sugerida sem tabela temporária.
-- A função é STABLE e o Postgres proíbe CREATE TEMP TABLE nesse contexto, o que fazia
-- toda chamada falhar. Reescrita com CTEs, mantendo a mesma resposta JSON.
CREATE OR REPLACE FUNCTION public.dp_convocacao_necessidade_sugerida(
  _company_id uuid, _unidade_id uuid, _cargo_id uuid, _data date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_res jsonb;
  v_fonte text := 'historico_convocacoes';
BEGIN
  IF _company_id IS NULL OR _cargo_id IS NULL OR _data IS NULL THEN
    RETURN jsonb_build_object('sugerido', NULL, 'ambiguo', false, 'fonte', NULL, 'alternativas', '[]'::jsonb);
  END IF;
  IF NOT private.is_company_admin_or_owner(auth.uid(), _company_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: acesso negado.' USING ERRCODE = '42501';
  END IF;

  -- Fonte 1: histórico de convocações efetivamente publicadas para o mesmo cargo,
  -- unidade e dia da semana. Mais recente pesa mais.
  WITH base AS (
    SELECT o.necessidade_entrada AS entrada,
           o.necessidade_saida AS saida,
           COALESCE(o.intervalo_minutos, 0) AS intervalo_minutos,
           COALESCE(o.necessidade_termina_no_dia_seguinte, false) AS vira,
           1 + (120 - (_data - o.data))::numeric / 40 AS peso
      FROM public.dp_convocacao_ocorrencias o
     WHERE o.company_id = _company_id
       AND o.cargo_id = _cargo_id
       AND (_unidade_id IS NULL OR o.unidade_id = _unidade_id)
       AND o.status IN ('publicada','preenchida','encerrada_operacionalmente','apurada','revisada')
       AND o.necessidade_entrada IS NOT NULL AND o.necessidade_saida IS NOT NULL
       AND o.data < _data AND o.data >= _data - 120
       AND EXTRACT(DOW FROM o.data) = EXTRACT(DOW FROM _data)
  ), janelas AS (
    SELECT entrada, saida, intervalo_minutos, vira,
           GREATEST(1, round(sum(peso))::int) AS quantidade
      FROM base
     GROUP BY entrada, saida, intervalo_minutos, vira
  )
  SELECT public._dp_conv_janelas_json(janelas.*) INTO v_res FROM (SELECT 1) s
   CROSS JOIN LATERAL (SELECT 1) janelas
   LIMIT 0;

  -- monta o resultado a partir das janelas do histórico
  WITH base AS (
    SELECT o.necessidade_entrada AS entrada,
           o.necessidade_saida AS saida,
           COALESCE(o.intervalo_minutos, 0) AS intervalo_minutos,
           COALESCE(o.necessidade_termina_no_dia_seguinte, false) AS vira,
           1 + (120 - (_data - o.data))::numeric / 40 AS peso
      FROM public.dp_convocacao_ocorrencias o
     WHERE o.company_id = _company_id
       AND o.cargo_id = _cargo_id
       AND (_unidade_id IS NULL OR o.unidade_id = _unidade_id)
       AND o.status IN ('publicada','preenchida','encerrada_operacionalmente','apurada','revisada')
       AND o.necessidade_entrada IS NOT NULL AND o.necessidade_saida IS NOT NULL
       AND o.data < _data AND o.data >= _data - 120
       AND EXTRACT(DOW FROM o.data) = EXTRACT(DOW FROM _data)
  ), janelas AS (
    SELECT entrada, saida, intervalo_minutos, vira,
           GREATEST(1, round(sum(peso))::int) AS quantidade
      FROM base
     GROUP BY entrada, saida, intervalo_minutos, vira
  )
  SELECT jsonb_build_object(
           'lista', COALESCE(jsonb_agg(jsonb_build_object(
                      'entrada', entrada, 'saida', saida,
                      'intervalo_minutos', intervalo_minutos,
                      'termina_no_dia_seguinte', vira,
                      'quantidade', quantidade)
                    ORDER BY quantidade DESC, entrada), '[]'::jsonb))
    INTO v_res
    FROM janelas;

  IF jsonb_array_length(v_res->'lista') = 0 THEN
    v_fonte := 'equipe_fixa';
    -- Fonte 2: prática da equipe fixa no dia.
    WITH base AS (
      SELECT ei.entrada, ei.saida,
             COALESCE(ei.intervalo_minutos, 0) AS intervalo_minutos,
             COALESCE(ei.termina_no_dia_seguinte, false) AS vira
        FROM public.dp_escala_itens ei
        JOIN public.dp_colaboradores c
          ON c.id = ei.colaborador_id AND c.company_id = ei.company_id
       WHERE ei.company_id = _company_id
         AND ei.data = _data
         AND ei.tipo::text <> 'folga'
         AND ei.entrada IS NOT NULL AND ei.saida IS NOT NULL
         AND c.cargo_id = _cargo_id
         AND (_unidade_id IS NULL OR c.unidade_id = _unidade_id)
         AND c.ativo IS NOT FALSE
         AND NOT public.dp_regime_convocavel(c.regime)
      UNION ALL
      SELECT d.entrada, d.saida,
             COALESCE(d.intervalo_minutos, 0) AS intervalo_minutos,
             false AS vira
        FROM public.dp_colaborador_config_trabalho ct
        JOIN public.dp_colaborador_config_dias d
          ON d.config_id = ct.id AND d.company_id = ct.company_id
        JOIN public.dp_colaboradores c
          ON c.id = ct.colaborador_id AND c.company_id = ct.company_id
       WHERE ct.company_id = _company_id
         AND d.dow = EXTRACT(DOW FROM _data)::int
         AND d.trabalha IS TRUE
         AND d.entrada IS NOT NULL AND d.saida IS NOT NULL
         AND (ct.vigencia_inicio IS NULL OR ct.vigencia_inicio <= _data)
         AND (ct.vigencia_fim IS NULL OR ct.vigencia_fim >= _data)
         AND c.cargo_id = _cargo_id
         AND (_unidade_id IS NULL OR c.unidade_id = _unidade_id)
         AND c.ativo IS NOT FALSE
         AND NOT public.dp_regime_convocavel(c.regime)
    ), janelas AS (
      SELECT entrada, saida, intervalo_minutos, vira, count(*)::int AS quantidade
        FROM base
       GROUP BY entrada, saida, intervalo_minutos, vira
    )
    SELECT jsonb_build_object(
             'lista', COALESCE(jsonb_agg(jsonb_build_object(
                        'entrada', entrada, 'saida', saida,
                        'intervalo_minutos', intervalo_minutos,
                        'termina_no_dia_seguinte', vira,
                        'quantidade', quantidade)
                      ORDER BY quantidade DESC, entrada), '[]'::jsonb))
      INTO v_res
      FROM janelas;
  END IF;

  IF jsonb_array_length(v_res->'lista') = 0 THEN
    RETURN jsonb_build_object('sugerido', NULL, 'ambiguo', false, 'fonte', NULL, 'alternativas', '[]'::jsonb);
  END IF;

  RETURN (
    WITH lista AS (
      SELECT j.* FROM jsonb_array_elements(v_res->'lista') AS j
    ), ordenada AS (
      SELECT j.value AS item, (j.value->>'quantidade')::int AS qtd
        FROM jsonb_array_elements(v_res->'lista') AS j(value)
       ORDER BY (j.value->>'quantidade')::int DESC, j.value->>'entrada', j.value->>'saida'
    ), topo AS (
      SELECT item, qtd FROM ordenada LIMIT 1
    )
    SELECT jsonb_build_object(
             'sugerido', (SELECT item FROM topo),
             'ambiguo', (SELECT count(*) > 1 FROM ordenada WHERE qtd = (SELECT qtd FROM topo)),
             'fonte', v_fonte,
             'alternativas', v_res->'lista')
  );
END;
$function$;
