DROP POLICY IF EXISTS "dp_colab_admin_read" ON public.dp_colaboradores;
DROP POLICY IF EXISTS "dp_colab_admin_write" ON public.dp_colaboradores;
DROP POLICY IF EXISTS "dp_colab_self_read" ON public.dp_colaboradores;

CREATE POLICY "dp_colab_admin_read"
ON public.dp_colaboradores
FOR SELECT
TO authenticated
USING (
  (deleted_at IS NULL)
  AND (
    private.is_company_admin_or_owner((SELECT auth.uid()), company_id)
    OR EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = dp_colaboradores.company_id AND c.user_id = (SELECT auth.uid())
    )
    OR public.is_super_admin((SELECT auth.uid()))
  )
);

CREATE POLICY "dp_colab_admin_write"
ON public.dp_colaboradores
FOR ALL
TO authenticated
USING (
  (deleted_at IS NULL)
  AND (
    private.is_company_admin_or_owner((SELECT auth.uid()), company_id)
    OR EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = dp_colaboradores.company_id AND c.user_id = (SELECT auth.uid())
    )
    OR public.is_super_admin((SELECT auth.uid()))
  )
)
WITH CHECK (
  private.is_company_admin_or_owner((SELECT auth.uid()), company_id)
  OR EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id = dp_colaboradores.company_id AND c.user_id = (SELECT auth.uid())
  )
  OR public.is_super_admin((SELECT auth.uid()))
);

CREATE POLICY "dp_colab_self_read"
ON public.dp_colaboradores
FOR SELECT
TO authenticated
USING ((deleted_at IS NULL) AND (user_id = (SELECT auth.uid())));