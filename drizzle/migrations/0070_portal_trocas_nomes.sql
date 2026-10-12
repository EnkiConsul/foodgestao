CREATE OR REPLACE FUNCTION public.dp_portal_trocas_partes(p_ids uuid[])
RETURNS TABLE(troca_id uuid, solicitante_nome text, solicitante_matricula text, solicitante_cargo text, solicitante_unidade text,
              destino_nome text, destino_matricula text, destino_cargo text, destino_unidade text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_colab uuid := public.dp_colaborador_ativo_of(auth.uid());
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'nao_autenticado' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT t.id,
         s.nome::text, s.matricula::text, coalesce(cs.nome, s.cargo)::text, us.nome::text,
         d.nome::text, d.matricula::text, coalesce(cd.nome, d.cargo)::text, ud.nome::text
  FROM public.dp_trocas t
  LEFT JOIN public.dp_colaboradores s ON s.id = t.solicitante_id
  LEFT JOIN public.dp_cargos cs ON cs.id = s.cargo_id
  LEFT JOIN public.dp_unidades us ON us.id = s.unidade_id
  LEFT JOIN public.dp_colaboradores d ON d.id = t.destino_id
  LEFT JOIN public.dp_cargos cd ON cd.id = d.cargo_id
  LEFT JOIN public.dp_unidades ud ON ud.id = d.unidade_id
  WHERE t.id = ANY(p_ids)
    AND (v_colab IN (t.solicitante_id, t.destino_id)
         OR private.is_company_admin_or_owner(auth.uid(), t.company_id)
         OR public.tem_permissao(t.company_id, 'dp.folgas', 'consulta')
         OR public.is_super_admin(auth.uid()));
END $$;
REVOKE ALL ON FUNCTION public.dp_portal_trocas_partes(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_portal_trocas_partes(uuid[]) TO authenticated, service_role;