CREATE OR REPLACE FUNCTION public.dp_portal_minha_regra_compensacao()
RETURNS TABLE(compensa_feriados boolean, antecedencia_dias integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(cc.usa_compensa_feriados, u.compensa_feriados, false),
         COALESCE(u.compensacao_feriado_antecedencia_dias, 2)
  FROM public.dp_colaboradores c
  LEFT JOIN public.dp_unidades u ON u.id = c.unidade_id
  LEFT JOIN public.dp_colaborador_compensacao cc ON cc.colaborador_id = c.id
  WHERE c.user_id = auth.uid() AND c.ativo AND c.deleted_at IS NULL
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.dp_portal_minha_regra_compensacao() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_portal_minha_regra_compensacao() TO authenticated, service_role;