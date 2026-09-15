-- Rotina da loja por turno: expõe o turno de cada linha e impede que regimes
-- convocáveis (intermitente/freelancer) apareçam sem convocação aceita.
DROP FUNCTION IF EXISTS public.dp_portal_rotina_dia(date);
CREATE FUNCTION public.dp_portal_rotina_dia(p_data date)
 RETURNS TABLE(colaborador_id uuid, nome text, nome_social text, cargo text, entrada time without time zone, saida time without time zone, origem text, setor_id uuid, setor_nome text, turno_id uuid, turno_nome text, turno_categoria text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_colab uuid;
  v_company uuid;
  v_unidade uuid;
  v_dow smallint;
  v_tem_publicada boolean;
BEGIN
  v_colab := public.dp_colaborador_ativo_of(auth.uid());
  IF v_colab IS NULL THEN RETURN; END IF;

  SELECT c.company_id, c.unidade_id INTO v_company, v_unidade
  FROM public.dp_colaboradores c WHERE c.id = v_colab;

  IF v_unidade IS NULL THEN RETURN; END IF;
  v_dow := extract(dow from p_data)::smallint;

  SELECT EXISTS (
    SELECT 1
    FROM public.dp_escala_itens i
    JOIN public.dp_escalas e ON e.id = i.escala_id
    WHERE i.data = p_data
      AND i.tipo = 'trabalho'
      AND e.unidade_id = v_unidade
      AND e.status = 'publicada'
  ) INTO v_tem_publicada;

  IF v_tem_publicada THEN
    RETURN QUERY
    SELECT DISTINCT ON (c.id)
      c.id, c.nome, c.nome_social, c.cargo, i.entrada, i.saida, 'escala'::text,
      coalesce(i.setor_id, c.setor_id),
      s.nome,
      i.turno_id,
      t.nome,
      t.categoria::text
    FROM public.dp_escala_itens i
    JOIN public.dp_escalas e ON e.id = i.escala_id
    JOIN public.dp_colaboradores c ON c.id = i.colaborador_id
    LEFT JOIN public.dp_setores s ON s.id = coalesce(i.setor_id, c.setor_id)
    LEFT JOIN public.dp_turnos t ON t.id = i.turno_id
    WHERE i.data = p_data
      AND i.tipo = 'trabalho'
      AND e.unidade_id = v_unidade
      AND e.status = 'publicada'
      AND NOT EXISTS (
        SELECT 1 FROM public.dp_folgas f
        WHERE f.colaborador_id = c.id
          AND f.data = p_data
          AND coalesce(f.status::text, '') <> 'cancelada'
      )
    ORDER BY c.id, i.entrada NULLS LAST;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.nome,
    c.nome_social,
    c.cargo,
    coalesce(d.entrada, t.entrada, tp.entrada),
    coalesce(d.saida, t.saida, tp.saida),
    'habitual'::text,
    coalesce(d.setor_id, c.setor_id),
    s.nome,
    coalesce(t.id, tp.id),
    coalesce(t.nome, tp.nome),
    coalesce(t.categoria, tp.categoria)::text
  FROM public.dp_colaboradores c
  JOIN public.dp_colaborador_config_trabalho ct
    ON ct.colaborador_id = c.id
   AND (ct.vigencia_inicio IS NULL OR ct.vigencia_inicio <= p_data)
   AND (ct.vigencia_fim IS NULL OR ct.vigencia_fim >= p_data)
  LEFT JOIN public.dp_colaborador_config_dias d
    ON d.config_id = ct.id AND d.dow = v_dow
  LEFT JOIN public.dp_turnos t ON t.id = d.turno_id
  LEFT JOIN public.dp_turnos tp ON tp.id = ct.turno_padrao_id
  LEFT JOIN public.dp_setores s ON s.id = coalesce(d.setor_id, c.setor_id)
  WHERE c.company_id = v_company
    AND c.unidade_id = v_unidade
    AND c.ativo IS NOT FALSE
    AND (c.data_desligamento IS NULL OR c.data_desligamento >= p_data)
    AND coalesce(d.trabalha, false) = true
    AND coalesce(ct.compoe_equipe_habitual, true) = true
    AND (
      c.regime_trabalho IS NULL
      OR c.regime_trabalho NOT IN ('intermitente'::dp_regime_trabalho, 'freelancer'::dp_regime_trabalho)
      OR EXISTS (
        SELECT 1 FROM public.dp_convocacoes cv
        WHERE cv.colaborador_id = c.id
          AND cv.data = p_data
          AND cv.status = 'aceita'::dp_convocacao_status
      )
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.dp_folgas f
      WHERE f.colaborador_id = c.id
        AND f.data = p_data
        AND coalesce(f.status::text, '') <> 'cancelada'
    )

  UNION

  SELECT
    c.id,
    c.nome,
    c.nome_social,
    c.cargo,
    coalesce(cv.entrada, t.entrada),
    coalesce(cv.saida, t.saida),
    'convocacao'::text,
    c.setor_id,
    s.nome,
    coalesce(cv.turno_id, t.id),
    t.nome,
    t.categoria::text
  FROM public.dp_convocacoes cv
  JOIN public.dp_colaboradores c ON c.id = cv.colaborador_id
  LEFT JOIN public.dp_turnos t ON t.id = cv.turno_id
  LEFT JOIN public.dp_setores s ON s.id = c.setor_id
  WHERE cv.data = p_data
    AND cv.status = 'aceita'::dp_convocacao_status
    AND cv.unidade_id = v_unidade
    AND cv.company_id = v_company
    AND NOT EXISTS (
      SELECT 1 FROM public.dp_folgas f
      WHERE f.colaborador_id = c.id
        AND f.data = p_data
        AND coalesce(f.status::text, '') <> 'cancelada'
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.dp_portal_rotina_dia(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_portal_rotina_dia(date) FROM anon;
GRANT EXECUTE ON FUNCTION public.dp_portal_rotina_dia(date) TO authenticated, service_role;
