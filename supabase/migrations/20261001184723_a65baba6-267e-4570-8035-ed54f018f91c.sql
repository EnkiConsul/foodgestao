update public.dp_bulk_import_items i
   set status = 'imported', error_message = null
  from public.dp_documentos d
 where i.batch_id = 'c682489a-b3bf-4e24-b42e-0b226c4b3374'
   and i.status = 'rejected'
   and d.id = i.imported_documento_id
   and d.ciclo_status = 'ativo';