ALTER TABLE public.dp_documentos DISABLE TRIGGER trg_dp_documento_versao_imutavel;

UPDATE public.dp_documentos
   SET file_path = company_id::text || '/' || file_path
 WHERE file_path LIKE 'documentos/%';

UPDATE public.dp_documentos
   SET comprovante_file_path = company_id::text || '/' || comprovante_file_path
 WHERE comprovante_file_path LIKE 'documentos/%';

ALTER TABLE public.dp_documentos ENABLE TRIGGER trg_dp_documento_versao_imutavel;
