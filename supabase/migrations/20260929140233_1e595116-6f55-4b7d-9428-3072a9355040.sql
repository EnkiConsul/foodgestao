CREATE POLICY dp_bulk_batch_rh_all ON public.dp_bulk_import_batches FOR ALL TO authenticated
USING (public.tem_permissao(company_id, 'dp.documentos', 'inclusao'))
WITH CHECK (public.tem_permissao(company_id, 'dp.documentos', 'inclusao'));

CREATE POLICY dp_bulk_item_rh_all ON public.dp_bulk_import_items FOR ALL TO authenticated
USING (public.tem_permissao(company_id, 'dp.documentos', 'inclusao'))
WITH CHECK (public.tem_permissao(company_id, 'dp.documentos', 'inclusao'));

CREATE POLICY dp_bulk_storage_rh_read ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'dp-bulk-import' AND public.tem_permissao(public.try_cast_uuid(split_part(name,'/',1)), 'dp.documentos', 'consulta'));
CREATE POLICY dp_bulk_storage_rh_write ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'dp-bulk-import' AND public.tem_permissao(public.try_cast_uuid(split_part(name,'/',1)), 'dp.documentos', 'inclusao'));
CREATE POLICY dp_bulk_storage_rh_update ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'dp-bulk-import' AND public.tem_permissao(public.try_cast_uuid(split_part(name,'/',1)), 'dp.documentos', 'inclusao'));
CREATE POLICY dp_bulk_storage_rh_delete ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'dp-bulk-import' AND public.tem_permissao(public.try_cast_uuid(split_part(name,'/',1)), 'dp.documentos', 'inclusao'));