-- Path convention: {company_id}/{product_id}/{file}
CREATE POLICY "ped_produtos_read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'ped-produtos'
  AND public.ped_can_read_catalog(NULLIF(split_part(name, '/', 1), '')::uuid)
);

CREATE POLICY "ped_produtos_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'ped-produtos'
  AND public.ped_can_edit_catalog(NULLIF(split_part(name, '/', 1), '')::uuid)
  AND lower(storage.extension(name)) IN ('jpg','jpeg','png','webp','avif')
  AND COALESCE((metadata->>'size')::bigint, 0) <= 5242880
  AND COALESCE(metadata->>'mimetype', 'image/jpeg') IN ('image/jpeg','image/png','image/webp','image/avif')
);

CREATE POLICY "ped_produtos_update" ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'ped-produtos'
  AND public.ped_can_edit_catalog(NULLIF(split_part(name, '/', 1), '')::uuid)
)
WITH CHECK (
  bucket_id = 'ped-produtos'
  AND public.ped_can_edit_catalog(NULLIF(split_part(name, '/', 1), '')::uuid)
  AND lower(storage.extension(name)) IN ('jpg','jpeg','png','webp','avif')
);

CREATE POLICY "ped_produtos_delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'ped-produtos'
  AND public.ped_can_edit_catalog(NULLIF(split_part(name, '/', 1), '')::uuid)
);

-- Detecção de órfãos (arquivos sem produto correspondente)
CREATE OR REPLACE FUNCTION public.ped_orphan_product_images(p_company_id uuid)
RETURNS TABLE(object_name text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, storage AS $$
BEGIN
  IF NOT public.ped_can_edit_catalog(p_company_id) THEN
    RAISE EXCEPTION 'Sem permissão para editar o cardápio.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT o.name, o.created_at
    FROM storage.objects o
   WHERE o.bucket_id = 'ped-produtos'
     AND split_part(o.name, '/', 1) = p_company_id::text
     AND NOT EXISTS (
       SELECT 1 FROM public.ped_products p
        WHERE p.image_path = o.name
     );
END; $$;
REVOKE ALL ON FUNCTION public.ped_orphan_product_images(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ped_orphan_product_images(uuid) TO authenticated;