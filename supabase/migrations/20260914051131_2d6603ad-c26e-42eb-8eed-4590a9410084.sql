DROP POLICY IF EXISTS "dp_disc_read" ON public.dp_registros_disciplinares;
CREATE POLICY "dp_disc_read" ON public.dp_registros_disciplinares
FOR SELECT TO authenticated
USING (private.is_company_admin_or_owner((SELECT auth.uid()), company_id));

DROP POLICY IF EXISTS "dp_disciplinar_read" ON storage.objects;
CREATE POLICY "dp_disciplinar_read" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'dp-disciplinar'
  AND private.is_company_admin_or_owner(auth.uid(), (split_part(name, '/', 1))::uuid)
);