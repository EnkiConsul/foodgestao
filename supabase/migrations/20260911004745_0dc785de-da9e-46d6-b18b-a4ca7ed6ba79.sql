CREATE OR REPLACE FUNCTION public.dp_portal_rotina_dia(p_data date)
RETURNS TABLE (
  colaborador_id uuid,
  nome text,
  nome_social text,
  cargo text,
  entrada time,
  saida time,
  origem text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
      c.id, c.nome, c.nome_social, c.cargo, i.entrada, i.saida, 'escala'::text
    FROM public.dp_escala_itens i
    JOIN public.dp_escalas e ON e.id = i.escala_id
    JOIN public.dp_colaboradores c ON c.id = i.colaborador_id
    WHERE i.data = p_data
      AND i.tipo = 'trabalho'
      AND e.unidade_id = v_unidade
      AND e.status = 'publicada'
    ORDER BY c.id, i.entrada NULLS LAST;
    RETURN;
  END IF;

  -- Sem escala publicada: monta pelo horário habitual de cada colega da unidade.
  RETURN QUERY
  SELECT
    c.id,
    c.nome,
    c.nome_social,
    c.cargo,
    coalesce(d.entrada, t.entrada, tp.entrada),
    coalesce(d.saida, t.saida, tp.saida),
    'habitual'::text
  FROM public.dp_colaboradores c
  JOIN public.dp_colaborador_config_trabalho ct
    ON ct.colaborador_id = c.id
   AND (ct.vigencia_inicio IS NULL OR ct.vigencia_inicio <= p_data)
   AND (ct.vigencia_fim IS NULL OR ct.vigencia_fim >= p_data)
  LEFT JOIN public.dp_colaborador_config_dias d
    ON d.config_id = ct.id AND d.dow = v_dow
  LEFT JOIN public.dp_turnos t ON t.id = d.turno_id
  LEFT JOIN public.dp_turnos tp ON tp.id = ct.turno_padrao_id
  WHERE c.company_id = v_company
    AND c.unidade_id = v_unidade
    AND c.ativo IS NOT FALSE
    AND (c.data_desligamento IS NULL OR c.data_desligamento >= p_data)
    AND coalesce(d.trabalha, false) = true
    AND coalesce(ct.compoe_equipe_habitual, true) = true
    AND NOT EXISTS (
      SELECT 1 FROM public.dp_folgas f
      WHERE f.colaborador_id = c.id
        AND f.data = p_data
        AND coalesce(f.status::text, '') <> 'cancelada'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.dp_portal_rotina_dia(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_portal_rotina_dia(date) TO authenticated, service_role;