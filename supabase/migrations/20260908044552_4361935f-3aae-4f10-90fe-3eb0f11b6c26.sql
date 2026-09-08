CREATE OR REPLACE FUNCTION public.dp_ferias_minhas()
RETURNS TABLE (
  periodo_id uuid,
  inicio_aquisitivo date,
  fim_aquisitivo date,
  limite_concessivo date,
  dias_direito smallint,
  dias_saldo smallint,
  periodo_status text,
  faltas_informadas boolean,
  adiantamento_13 text,
  aviso_antecedencia_dias smallint,
  gozos jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_col record;
BEGIN
  SELECT c.id, c.company_id, c.unidade_id INTO v_col
  FROM public.dp_colaboradores c
  WHERE c.user_id = auth.uid()
  ORDER BY c.ativo DESC NULLS LAST
  LIMIT 1;

  IF v_col.id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.id, p.inicio_aquisitivo, p.fim_aquisitivo, p.limite_concessivo,
         p.dias_direito, p.dias_saldo, p.status::text,
         p.faltas_injustificadas IS NOT NULL,
         cfg.adiantamento_13, cfg.aviso_antecedencia_dias,
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
                    'id', g.id,
                    'data_inicio', g.data_inicio,
                    'data_fim', g.data_fim,
                    'dias', g.dias,
                    'dias_abono', g.dias_abono,
                    'adiantar_13', g.adiantar_13,
                    'status', g.status,
                    'ciente_em', g.ciente_em,
                    'observacao', g.observacao
                  ) ORDER BY g.data_inicio DESC)
           FROM public.dp_ferias_gozos g
           WHERE g.periodo_id = p.id
         ), '[]'::jsonb)
  FROM public.dp_ferias_periodos p
  CROSS JOIN public.dp_ferias_config(v_col.company_id, v_col.unidade_id) cfg
  WHERE p.colaborador_id = v_col.id
    AND p.controle_externo = false
  ORDER BY p.inicio_aquisitivo DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_ferias_minhas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_ferias_minhas() TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_ferias_minhas() TO service_role;