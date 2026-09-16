-- Correção de segurança: caminho antigo do bucket dp-documentos permitia que o
-- colaborador baixasse seus próprios documentos disciplinares (confidenciais).
-- Alinha a política legada à política nova, excluindo tipo = 'disciplinar'.
-- Rollback: recriar a política sem a condição `d.tipo <> 'disciplinar'`.

DROP POLICY IF EXISTS dp_doc_bucket_legacy_read ON storage.objects;

CREATE POLICY dp_doc_bucket_legacy_read ON storage.objects FOR SELECT
USING (
  bucket_id = 'dp-documentos'
  AND name LIKE 'documentos/%'
  AND EXISTS (
    SELECT 1 FROM public.dp_documentos d
    WHERE d.file_path = storage.objects.name
      AND (
        private.is_company_admin_or_owner(auth.uid(), d.company_id)
        OR public.is_super_admin(auth.uid())
        OR (
          d.colaborador_id = public.dp_colaborador_ativo_of(auth.uid())
          AND d.tipo <> 'disciplinar'::public.dp_documento_tipo
        )
      )
  )
);
