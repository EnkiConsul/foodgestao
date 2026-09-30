CREATE OR REPLACE FUNCTION public.dp_portal_equipe_unidade()
 RETURNS TABLE(id uuid, nome text, nome_social text, cargo text, folga_fixa_semana integer, ativo boolean, unidade_id uuid, folgas_fixas_dow smallint[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_colab uuid; v_company uuid; v_unidade uuid; v_cat text;
BEGIN
  v_colab := public.dp_colaborador_ativo_of(auth.uid());
  IF v_colab IS NULL THEN RETURN; END IF;
  SELECT c.company_id, c.unidade_id INTO v_company, v_unidade FROM public.dp_colaboradores c WHERE c.id = v_colab;
  IF v_company IS NULL THEN RETURN; END IF;

  -- Categoria do turno vigente de quem consulta (ex.: jantar, abertura)
  SELECT t.categoria::text INTO v_cat
  FROM public.dp_colaborador_config_trabalho ct
  JOIN public.dp_turnos t ON t.id = ct.turno_padrao_id
  WHERE ct.colaborador_id = v_colab
    AND (ct.vigencia_inicio IS NULL OR ct.vigencia_inicio <= CURRENT_DATE)
    AND (ct.vigencia_fim IS NULL OR ct.vigencia_fim >= CURRENT_DATE)
  ORDER BY ct.vigencia_inicio DESC NULLS LAST
  LIMIT 1;

  RETURN QUERY
  SELECT c.id, c.nome, c.nome_social, c.cargo, c.folga_fixa_semana::integer, c.ativo, c.unidade_id,
         public.dp_dias_fixos_folga(c.id, CURRENT_DATE)
  FROM public.dp_colaboradores c
  WHERE c.company_id = v_company AND c.ativo IS NOT FALSE
    AND (v_unidade IS NULL OR c.unidade_id = v_unidade)
    AND (
      c.id = v_colab
      OR (
        -- Sócios nunca aparecem para colaboradores
        lower(coalesce(c.vinculo_label, '')) NOT IN ('socio', 'sócio')
        -- Só colegas do mesmo período de turno
        AND (
          v_cat IS NULL
          OR EXISTS (
            SELECT 1
            FROM public.dp_colaborador_config_trabalho ct2
            JOIN public.dp_turnos t2 ON t2.id = ct2.turno_padrao_id
            WHERE ct2.colaborador_id = c.id
              AND (ct2.vigencia_inicio IS NULL OR ct2.vigencia_inicio <= CURRENT_DATE)
              AND (ct2.vigencia_fim IS NULL OR ct2.vigencia_fim >= CURRENT_DATE)
              AND t2.categoria::text = v_cat
          )
        )
      )
    )
  ORDER BY c.nome;
END;
$function$;

REVOKE ALL ON FUNCTION public.dp_portal_equipe_unidade() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_portal_equipe_unidade() TO authenticated, service_role;