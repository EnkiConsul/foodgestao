-- M27 (Convocações) — sugestão de horário aprende com o histórico de convocações publicadas.
-- Rollback: recriar a versão anterior da função (apenas fonte "equipe fixa").
CREATE OR REPLACE FUNCTION public.dp_convocacao_necessidade_sugerida(
  _company_id uuid, _unidade_id uuid, _cargo_id uuid, _data date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_janelas jsonb := '[]'::jsonb;
  v_top record;
  v_qtd integer;
  v_fonte text := 'equipe_fixa';
BEGIN
  IF _company_id IS NULL OR _cargo_id IS NULL OR _data IS NULL THEN
    RETURN jsonb_build_object('sugerido', NULL, 'ambiguo', false, 'fonte', NULL, 'alternativas', '[]'::jsonb);
  END IF;
  IF NOT private.is_company_admin_or_owner(auth.uid(), _company_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: acesso negado.' USING ERRCODE = '42501';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS tmp_conv_janelas (
    entrada time, saida time, intervalo_minutos integer,
    termina_no_dia_seguinte boolean, quantidade integer
  ) ON COMMIT DROP;
  DELETE FROM tmp_conv_janelas;

  -- Fonte 1: histórico de convocações efetivamente publicadas para o mesmo cargo,
  -- unidade e dia da semana. Mais recente pesa mais (aprendizado dos ajustes do gestor).
  INSERT INTO tmp_conv_janelas
  SELECT h.entrada, h.saida, h.intervalo_minutos, h.vira,
         GREATEST(1, round(sum(h.peso))::int)
    FROM (
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
         AND o.data < _data
         AND o.data >= _data - 120
         AND EXTRACT(DOW FROM o.data) = EXTRACT(DOW FROM _data)
    ) h
   GROUP BY h.entrada, h.saida, h.intervalo_minutos, h.vira;

  SELECT count(*) INTO v_qtd FROM tmp_conv_janelas;
  IF COALESCE(v_qtd, 0) > 0 THEN
    v_fonte := 'historico_convocacoes';
  ELSE
    -- Fonte 2: prática da equipe fixa no dia (comportamento anterior).
    INSERT INTO tmp_conv_janelas
    SELECT j.entrada, j.saida, j.intervalo_minutos, j.vira, count(*)::int
      FROM (
        -- escala efetivamente programada no dia
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
        -- configuração de trabalho vigente dos fixos para o dia da semana
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
      ) j
     GROUP BY j.entrada, j.saida, j.intervalo_minutos, j.vira;

    SELECT count(*) INTO v_qtd FROM tmp_conv_janelas;
  END IF;

  IF COALESCE(v_qtd, 0) = 0 THEN
    RETURN jsonb_build_object('sugerido', NULL, 'ambiguo', false, 'fonte', NULL, 'alternativas', '[]'::jsonb);
  END IF;

  SELECT * INTO v_top
    FROM tmp_conv_janelas
   ORDER BY quantidade DESC, entrada, saida
   LIMIT 1;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'entrada', t.entrada, 'saida', t.saida,
           'intervalo_minutos', t.intervalo_minutos,
           'termina_no_dia_seguinte', t.termina_no_dia_seguinte,
           'quantidade', t.quantidade)
         ORDER BY t.quantidade DESC, t.entrada), '[]'::jsonb)
    INTO v_janelas
    FROM tmp_conv_janelas t;

  RETURN jsonb_build_object(
    'sugerido', jsonb_build_object(
      'entrada', v_top.entrada, 'saida', v_top.saida,
      'intervalo_minutos', v_top.intervalo_minutos,
      'termina_no_dia_seguinte', v_top.termina_no_dia_seguinte,
      'quantidade', v_top.quantidade),
    'ambiguo', (SELECT count(*) > 1 FROM tmp_conv_janelas WHERE quantidade = v_top.quantidade),
    'fonte', v_fonte,
    'alternativas', v_janelas);
END;
$$;

REVOKE ALL ON FUNCTION public.dp_convocacao_necessidade_sugerida(uuid, uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_necessidade_sugerida(uuid, uuid, uuid, date) TO authenticated;