
-- Fix: qualify `name` as storage.objects.name inside EXISTS subquery,
-- otherwise it resolves to companies.name (a text label), breaking ownership check.
DROP POLICY IF EXISTS "dp_bulk_storage_admin_read" ON storage.objects;
DROP POLICY IF EXISTS "dp_bulk_storage_admin_write" ON storage.objects;
DROP POLICY IF EXISTS "dp_bulk_storage_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "dp_bulk_storage_admin_delete" ON storage.objects;

CREATE POLICY "dp_bulk_storage_admin_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'dp-bulk-import'
    AND (
      private.is_company_admin_or_owner(auth.uid(), (storage.foldername(storage.objects.name))[1]::uuid)
      OR EXISTS (
        SELECT 1 FROM public.companies c
        WHERE c.id = (storage.foldername(storage.objects.name))[1]::uuid
          AND c.user_id = auth.uid()
      )
      OR public.is_super_admin(auth.uid())
    )
  );

CREATE POLICY "dp_bulk_storage_admin_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'dp-bulk-import'
    AND (
      private.is_company_admin_or_owner(auth.uid(), (storage.foldername(storage.objects.name))[1]::uuid)
      OR EXISTS (
        SELECT 1 FROM public.companies c
        WHERE c.id = (storage.foldername(storage.objects.name))[1]::uuid
          AND c.user_id = auth.uid()
      )
      OR public.is_super_admin(auth.uid())
    )
  );

CREATE POLICY "dp_bulk_storage_admin_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'dp-bulk-import'
    AND (
      private.is_company_admin_or_owner(auth.uid(), (storage.foldername(storage.objects.name))[1]::uuid)
      OR EXISTS (
        SELECT 1 FROM public.companies c
        WHERE c.id = (storage.foldername(storage.objects.name))[1]::uuid
          AND c.user_id = auth.uid()
      )
      OR public.is_super_admin(auth.uid())
    )
  );

CREATE POLICY "dp_bulk_storage_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'dp-bulk-import'
    AND (
      private.is_company_admin_or_owner(auth.uid(), (storage.foldername(storage.objects.name))[1]::uuid)
      OR EXISTS (
        SELECT 1 FROM public.companies c
        WHERE c.id = (storage.foldername(storage.objects.name))[1]::uuid
          AND c.user_id = auth.uid()
      )
      OR public.is_super_admin(auth.uid())
    )
  );
