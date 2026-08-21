DROP FUNCTION IF EXISTS public.dp_turnos_uso(uuid);

CREATE FUNCTION public.dp_turnos_uso(p_company_id uuid)
RETURNS TABLE (
  turno_id uuid,
  colaboradores_padrao integer,
  config_dias integer,
  escala_itens_publicados integer,
  escala_itens_rascunho integer,
  convocacoes integer,
  cobertura_minima integer,
  versoes integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id AS turno_id,
    (SELECT count(*) FROM public.dp_colaborador_config_trabalho c
       JOIN public.dp_colaboradores col ON col.id = c.colaborador_id
      WHERE c.turno_padrao_id = t.id
        AND col.deleted_at IS NULL
        AND col.ativo IS TRUE
        AND col.data_desligamento IS NULL)::int,
    (SELECT count(*) FROM public.dp_colaborador_config_dias d
       JOIN public.dp_colaborador_config_trabalho c2 ON c2.id = d.config_id
       JOIN public.dp_colaboradores col ON col.id = c2.colaborador_id
      WHERE d.turno_id = t.id
        AND col.deleted_at IS NULL
        AND col.ativo IS TRUE
        AND col.data_desligamento IS NULL)::int,
    (SELECT count(*) FROM public.dp_escala_itens i
       JOIN public.dp_escalas e ON e.id = i.escala_id
      WHERE i.turno_id = t.id AND e.status IN ('publicada','arquivada'))::int,
    (SELECT count(*) FROM public.dp_escala_itens i
       JOIN public.dp_escalas e ON e.id = i.escala_id
      WHERE i.turno_id = t.id AND e.status = 'rascunho')::int,
    (SELECT count(*) FROM public.dp_convocacoes v WHERE v.turno_id = t.id)::int,
    (SELECT count(*) FROM public.dp_cobertura_minima m WHERE m.turno_id = t.id)::int,
    (SELECT count(*) FROM public.dp_turnos o WHERE o.turno_origem_id = t.id)::int
  FROM public.dp_turnos t
  WHERE t.company_id = p_company_id
    AND private.is_company_member((SELECT auth.uid()), p_company_id);
$$;

REVOKE ALL ON FUNCTION public.dp_turnos_uso(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_turnos_uso(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_turnos_uso(uuid) TO service_role;