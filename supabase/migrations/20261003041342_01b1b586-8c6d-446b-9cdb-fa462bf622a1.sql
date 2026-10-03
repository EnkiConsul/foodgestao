DROP POLICY IF EXISTS dp_doc_bucket_admin_write ON storage.objects;
CREATE POLICY dp_doc_bucket_admin_write ON storage.objects FOR ALL
USING (bucket_id = 'dp-documentos' AND (private.is_company_admin_or_owner(auth.uid(), try_cast_uuid(split_part(name, '/', 1))) OR public.is_super_admin(auth.uid())))
WITH CHECK (bucket_id = 'dp-documentos' AND (private.is_company_admin_or_owner(auth.uid(), try_cast_uuid(split_part(name, '/', 1))) OR public.is_super_admin(auth.uid())));

GRANT ALL ON public.dp_modelos_mensagem_padrao TO service_role;
CREATE POLICY dp_modelos_padrao_super_admin ON public.dp_modelos_mensagem_padrao FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));