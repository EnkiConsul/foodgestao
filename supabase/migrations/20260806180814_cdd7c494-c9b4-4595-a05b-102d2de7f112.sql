CREATE POLICY "storefront_media_company_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'ped-storefront'
    AND public.ped_can_read_catalog(((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "storefront_media_company_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ped-storefront'
    AND public.ped_can_edit_catalog(((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "storefront_media_company_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'ped-storefront'
    AND public.ped_can_edit_catalog(((storage.foldername(name))[1])::uuid)
  )
  WITH CHECK (
    bucket_id = 'ped-storefront'
    AND public.ped_can_edit_catalog(((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "storefront_media_company_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'ped-storefront'
    AND public.ped_can_edit_catalog(((storage.foldername(name))[1])::uuid)
  );

CREATE OR REPLACE FUNCTION public.storefront_public_asset_allowed(p_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ped_storefronts s
     WHERE s.is_published
       AND (s.logo_url = p_path OR s.banner_url = p_path)
  );
$$;

GRANT EXECUTE ON FUNCTION public.storefront_public_asset_allowed(text) TO anon, authenticated, service_role;