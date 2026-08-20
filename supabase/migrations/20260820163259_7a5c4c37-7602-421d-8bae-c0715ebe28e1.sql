CREATE OR REPLACE FUNCTION public.dp_turno_colaboradores(p_turno_id uuid)
RETURNS TABLE (
  colaborador_id uuid,
  nome text,
  cargo_nome text,
  unidade_nome text,
  origem text,
  ativo boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH turno AS (
    SELECT t.id, t.company_id
    FROM public.dp_turnos t
    WHERE t.id = p_turno_id
      AND private.is_company_member((SELECT auth.uid()), t.company_id)
  ),
  vinculos AS (
    SELECT c.colaborador_id, 1 AS prioridade
    FROM public.dp_colaborador_config_trabalho c
    JOIN turno ON turno.id = c.turno_padrao_id
    UNION ALL
    SELECT ct.colaborador_id, 2
    FROM public.dp_colaborador_config_dias d
    JOIN public.dp_colaborador_config_trabalho ct ON ct.id = d.config_id
    JOIN turno ON turno.id = d.turno_id
    UNION ALL
    SELECT i.colaborador_id, 3
    FROM public.dp_escala_itens i
    JOIN public.dp_escalas e ON e.id = i.escala_id
    JOIN turno ON turno.id = i.turno_id
    WHERE i.colaborador_id IS NOT NULL
      AND left(e.competencia, 7) >= to_char(current_date, 'YYYY-MM')
  ),
  melhor AS (
    SELECT v.colaborador_id, min(v.prioridade) AS prioridade
    FROM vinculos v
    WHERE v.colaborador_id IS NOT NULL
    GROUP BY v.colaborador_id
  )
  SELECT
    col.id,
    col.nome,
    cg.nome,
    un.nome,
    CASE m.prioridade WHEN 1 THEN 'turno_padrao' WHEN 2 THEN 'dias_fixos' ELSE 'escala' END,
    col.ativo
  FROM melhor m
  JOIN public.dp_colaboradores col ON col.id = m.colaborador_id
  LEFT JOIN public.dp_cargos cg ON cg.id = col.cargo_id
  LEFT JOIN public.dp_unidades un ON un.id = col.unidade_id
  ORDER BY col.ativo DESC, m.prioridade, col.nome;
$$;

REVOKE ALL ON FUNCTION public.dp_turno_colaboradores(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_turno_colaboradores(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_turno_colaboradores(uuid) TO service_role;