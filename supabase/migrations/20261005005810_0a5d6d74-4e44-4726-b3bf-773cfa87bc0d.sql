CREATE POLICY dp_doc_bucket_read_atestado_proprio ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'dp-documentos' AND EXISTS (
    SELECT 1 FROM public.dp_solicitacoes s
    WHERE s.arquivo_path = objects.name
      AND s.company_id = public.try_cast_uuid(split_part(objects.name, '/', 1))
      AND s.colaborador_id = public.dp_colaborador_ativo_of(auth.uid())
  )
);