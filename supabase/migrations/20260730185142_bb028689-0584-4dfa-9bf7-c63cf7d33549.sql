-- Repoint dp_pendencias_config policies to the canonical private.is_company_admin_or_owner
DROP POLICY IF EXISTS "Admins can delete pendencias config" ON public.dp_pendencias_config;
DROP POLICY IF EXISTS "Admins can insert pendencias config" ON public.dp_pendencias_config;
DROP POLICY IF EXISTS "Admins can update pendencias config" ON public.dp_pendencias_config;
DROP POLICY IF EXISTS "Members can view pendencias config" ON public.dp_pendencias_config;

CREATE POLICY "Admins can delete pendencias config"
ON public.dp_pendencias_config FOR DELETE TO authenticated
USING (private.is_company_admin_or_owner(auth.uid(), company_id));

CREATE POLICY "Admins can insert pendencias config"
ON public.dp_pendencias_config FOR INSERT TO authenticated
WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));

CREATE POLICY "Admins can update pendencias config"
ON public.dp_pendencias_config FOR UPDATE TO authenticated
USING (private.is_company_admin_or_owner(auth.uid(), company_id))
WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));

CREATE POLICY "Members can view pendencias config"
ON public.dp_pendencias_config FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.company_id = dp_pendencias_config.company_id
      AND cm.user_id = auth.uid()
  )
);