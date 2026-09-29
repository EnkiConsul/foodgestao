CREATE POLICY dp_bulk_storage_ficha_rh_write ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'dp-bulk-import' AND split_part(name,'/',2) = 'fichas'
  AND public.tem_permissao(public.try_cast_uuid(split_part(name,'/',1)), 'dp.colaboradores', 'inclusao'));
CREATE POLICY dp_bulk_storage_ficha_rh_read ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'dp-bulk-import' AND split_part(name,'/',2) = 'fichas'
  AND public.tem_permissao(public.try_cast_uuid(split_part(name,'/',1)), 'dp.colaboradores', 'consulta'));
CREATE POLICY dp_bulk_storage_ficha_rh_update ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'dp-bulk-import' AND split_part(name,'/',2) = 'fichas'
  AND public.tem_permissao(public.try_cast_uuid(split_part(name,'/',1)), 'dp.colaboradores', 'inclusao'));
-- Rollback: DROP POLICY dp_bulk_storage_ficha_rh_write/read/update ON storage.objects;