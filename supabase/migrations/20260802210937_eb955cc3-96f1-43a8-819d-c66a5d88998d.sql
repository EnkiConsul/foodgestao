-- 1) banks: restrict catalog read to authenticated users only
DROP POLICY IF EXISTS "Anyone authenticated can read active banks" ON public.banks;
CREATE POLICY "Authenticated can read active banks"
ON public.banks FOR SELECT TO authenticated
USING ((is_active = true) OR public.is_super_admin((SELECT auth.uid())));
REVOKE SELECT ON public.banks FROM anon;

-- 2) plans: scope the public pricing policy to anon+authenticated instead of every role
DROP POLICY IF EXISTS "Anyone can view active public plans" ON public.plans;
CREATE POLICY "Anyone can view active public plans"
ON public.plans FOR SELECT TO anon, authenticated
USING (is_active = true AND is_public = true);

-- 3) dp_folgas: harden colaborador read policy (NULL-safe + own colaborador scope)
DROP POLICY IF EXISTS dp_folgas_read_colaborador ON public.dp_folgas;
CREATE POLICY dp_folgas_read_colaborador
ON public.dp_folgas FOR SELECT TO authenticated
USING (
  company_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.dp_colaboradores c
    WHERE c.id = public.dp_colaborador_of((SELECT auth.uid()))
      AND c.company_id = dp_folgas.company_id
  )
);