CREATE OR REPLACE FUNCTION public.dp_portal_equipe_unidade()
 RETURNS TABLE(id uuid, nome text, nome_social text, cargo text, folga_fixa_semana integer, ativo boolean, unidade_id uuid, folgas_fixas_dow smallint[])
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_colab uuid; v_company uuid; v_unidade uuid;
BEGIN
  v_colab := public.dp_colaborador_ativo_of(auth.uid());
  IF v_colab IS NULL THEN RETURN; END IF;
  SELECT c.company_id, c.unidade_id INTO v_company, v_unidade FROM public.dp_colaboradores c WHERE c.id = v_colab;
  IF v_company IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT c.id, c.nome, c.nome_social, c.cargo, c.folga_fixa_semana::integer, c.ativo, c.unidade_id,
         public.dp_dias_fixos_folga(c.id, CURRENT_DATE)
  FROM public.dp_colaboradores c
  WHERE c.company_id = v_company AND c.ativo IS NOT FALSE
    AND (v_unidade IS NULL OR c.unidade_id = v_unidade)
  ORDER BY c.nome;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.dp_portal_equipe_unidade() TO authenticated;