CREATE OR REPLACE FUNCTION public.dp_portal_equipe_fora_dia(p_data date)
RETURNS TABLE(colaborador_id uuid, nome text, nome_social text, cargo text, situacao text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_colab uuid; v_company uuid; v_unidade uuid;
BEGIN
  v_colab := public.dp_colaborador_ativo_of(auth.uid());
  IF v_colab IS NULL THEN RETURN; END IF;
  SELECT c.company_id, c.unidade_id INTO v_company, v_unidade FROM public.dp_colaboradores c WHERE c.id = v_colab;
  IF v_unidade IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT x.id, x.nome, x.nome_social, x.cargo, x.sit FROM (
    SELECT c.id, c.nome, c.nome_social, c.cargo,
      CASE
        WHEN EXISTS (SELECT 1 FROM public.dp_ferias_gozos g WHERE g.colaborador_id = c.id
               AND g.status IN ('aprovado','em_gozo') AND g.data_inicio <= p_data AND g.data_fim >= p_data) THEN 'ferias'
        WHEN private.dp_colab_afastado_em(c.id, p_data) THEN 'ausente'
        WHEN EXISTS (SELECT 1 FROM public.dp_folgas f WHERE f.colaborador_id = c.id AND f.data = p_data
               AND coalesce(f.status::text,'') <> 'cancelada') THEN 'folga'
        ELSE NULL END AS sit
    FROM public.dp_colaboradores c
    WHERE c.company_id = v_company AND c.unidade_id = v_unidade AND c.ativo IS NOT FALSE
      AND (c.data_desligamento IS NULL OR c.data_desligamento >= p_data)
  ) x WHERE x.sit IS NOT NULL
  ORDER BY coalesce(x.nome_social, x.nome);
END;
$function$;
REVOKE ALL ON FUNCTION public.dp_portal_equipe_fora_dia(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_portal_equipe_fora_dia(date) TO authenticated, service_role;