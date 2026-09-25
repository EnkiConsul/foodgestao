CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public'
AS $$
  SELECT public.has_role(_user_id, 'super_admin')
     AND (
       coalesce(auth.role(), '') = 'service_role'
       OR auth.uid() IS NULL
       OR auth.uid() IS DISTINCT FROM _user_id
       OR coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     )
$$;

DROP POLICY IF EXISTS dp_doc_bucket_admin_write ON storage.objects;
CREATE POLICY dp_doc_bucket_admin_write ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'dp-documentos' AND private.is_company_admin_or_owner(auth.uid(), try_cast_uuid(split_part(name, '/', 1))))
WITH CHECK (bucket_id = 'dp-documentos' AND private.is_company_admin_or_owner(auth.uid(), try_cast_uuid(split_part(name, '/', 1))));

DROP POLICY IF EXISTS dp_bulk_storage_admin_write ON storage.objects;
CREATE POLICY dp_bulk_storage_admin_write ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'dp-bulk-import' AND (private.is_company_admin_or_owner(auth.uid(), try_cast_uuid(split_part(name, '/', 1)))
  OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = try_cast_uuid(split_part(objects.name, '/', 1)) AND c.user_id = auth.uid())));

DROP POLICY IF EXISTS dp_bulk_storage_admin_update ON storage.objects;
CREATE POLICY dp_bulk_storage_admin_update ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'dp-bulk-import' AND (private.is_company_admin_or_owner(auth.uid(), try_cast_uuid(split_part(name, '/', 1)))
  OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = try_cast_uuid(split_part(objects.name, '/', 1)) AND c.user_id = auth.uid())));

DROP POLICY IF EXISTS dp_bulk_storage_admin_delete ON storage.objects;
CREATE POLICY dp_bulk_storage_admin_delete ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'dp-bulk-import' AND (private.is_company_admin_or_owner(auth.uid(), try_cast_uuid(split_part(name, '/', 1)))
  OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = try_cast_uuid(split_part(objects.name, '/', 1)) AND c.user_id = auth.uid())));