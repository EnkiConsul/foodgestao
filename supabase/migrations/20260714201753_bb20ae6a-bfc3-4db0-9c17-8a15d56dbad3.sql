
DROP POLICY IF EXISTS "dp_doc_bucket_admin_write" ON storage.objects;
DROP POLICY IF EXISTS "dp_doc_bucket_member_read" ON storage.objects;

CREATE POLICY "dp_doc_bucket_admin_write"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'dp-documentos'
  AND (
    private.is_company_admin_or_owner(auth.uid(), (split_part(name, '/', 1))::uuid)
    OR public.is_super_admin(auth.uid())
  )
)
WITH CHECK (
  bucket_id = 'dp-documentos'
  AND (
    private.is_company_admin_or_owner(auth.uid(), (split_part(name, '/', 1))::uuid)
    OR public.is_super_admin(auth.uid())
  )
);

CREATE POLICY "dp_doc_bucket_member_read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'dp-documentos'
  AND (
    private.is_company_member(auth.uid(), (split_part(name, '/', 1))::uuid)
    OR public.is_super_admin(auth.uid())
  )
);
