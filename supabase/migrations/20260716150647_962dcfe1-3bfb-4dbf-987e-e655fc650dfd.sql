
DROP POLICY IF EXISTS "dp_disciplinar_read" ON storage.objects;
CREATE POLICY "dp_disciplinar_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'dp-disciplinar'
    AND private.is_company_member(auth.uid(), (split_part(name, '/', 1))::uuid)
  );

DROP POLICY IF EXISTS "dp_disciplinar_write" ON storage.objects;
CREATE POLICY "dp_disciplinar_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'dp-disciplinar'
    AND private.is_company_admin_or_owner(auth.uid(), (split_part(name, '/', 1))::uuid)
  );

DROP POLICY IF EXISTS "dp_disciplinar_update" ON storage.objects;
CREATE POLICY "dp_disciplinar_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'dp-disciplinar'
    AND private.is_company_admin_or_owner(auth.uid(), (split_part(name, '/', 1))::uuid)
  );

DROP POLICY IF EXISTS "dp_disciplinar_delete" ON storage.objects;
CREATE POLICY "dp_disciplinar_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'dp-disciplinar'
    AND private.is_company_admin_or_owner(auth.uid(), (split_part(name, '/', 1))::uuid)
  );
