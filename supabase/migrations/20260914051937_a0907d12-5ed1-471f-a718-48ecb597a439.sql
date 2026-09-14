-- 1) Pisos por cargo/unidade: leitura só admin/owner (ou super_admin)
DROP POLICY IF EXISTS "dp_cargo_salarios_select_members" ON public.dp_cargo_salarios;
CREATE POLICY "dp_cargo_salarios_select_admin" ON public.dp_cargo_salarios
FOR SELECT TO authenticated
USING (
  private.is_company_admin_or_owner((SELECT auth.uid()), company_id)
  OR public.has_role((SELECT auth.uid()), 'super_admin')
);

-- 2) dp_cargos.salario_base deixa de ser legível pelo cliente
REVOKE SELECT ON public.dp_cargos FROM authenticated;
REVOKE SELECT ON public.dp_cargos FROM anon;
GRANT SELECT (
  id, company_id, nome, cbo, ativo, created_at, updated_at, descricao,
  insalubre_periculoso, exige_cnh, cnh_categoria_minima, exige_epi,
  insalubre, perigoso, insalubridade_percentual, periculosidade_percentual,
  base_horas_mes, base_dias_mes
) ON public.dp_cargos TO authenticated;
GRANT ALL ON public.dp_cargos TO service_role;

-- 3) Caminho protegido para admins consultarem o salário legado do cargo
CREATE OR REPLACE FUNCTION public.dp_cargos_salario_base(p_company_id uuid)
RETURNS TABLE (cargo_id uuid, salario_base numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.salario_base
    FROM public.dp_cargos c
   WHERE c.company_id = p_company_id
     AND (
       private.is_company_admin_or_owner(auth.uid(), p_company_id)
       OR public.has_role(auth.uid(), 'super_admin')
     )
$$;

REVOKE ALL ON FUNCTION public.dp_cargos_salario_base(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_cargos_salario_base(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_cargos_salario_base(uuid) TO service_role;