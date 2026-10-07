CREATE POLICY dp_doc_bucket_read_avisos ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'dp-documentos' AND EXISTS (
    SELECT 1 FROM public.dp_avisos a
    WHERE a.arquivo_path = storage.objects.name
      AND (private.is_company_member(auth.uid(), a.company_id)
           OR private.is_dp_colaborador_of_company(auth.uid(), a.company_id))
  )
);