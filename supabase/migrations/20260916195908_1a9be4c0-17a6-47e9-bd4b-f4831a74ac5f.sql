DROP POLICY IF EXISTS dp_doc_bucket_read_autorizado ON storage.objects;

CREATE POLICY dp_doc_bucket_read_autorizado ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'dp-documentos'
    AND (
      private.is_company_admin_or_owner(auth.uid(), (split_part(name, '/', 1))::uuid)
      OR public.is_super_admin(auth.uid())
      OR EXISTS (
        SELECT 1
        FROM public.dp_documentos d
        WHERE (d.file_path = objects.name OR d.comprovante_file_path = objects.name)
          AND d.company_id = (split_part(objects.name, '/', 1))::uuid
          AND d.colaborador_id IS NOT NULL
          AND d.colaborador_id = public.dp_colaborador_ativo_of(auth.uid())
          AND d.tipo <> 'disciplinar'::public.dp_documento_tipo
          AND d.ciclo_status = ANY (ARRAY['ativo'::text, 'arquivado'::text])
      )
    )
  );