ALTER TABLE public.dp_documento_requisitos
  ADD COLUMN IF NOT EXISTS responsavel text NOT NULL DEFAULT 'colaborador';

ALTER TABLE public.dp_documento_requisitos
  DROP CONSTRAINT IF EXISTS dp_documento_requisitos_responsavel_check;

ALTER TABLE public.dp_documento_requisitos
  ADD CONSTRAINT dp_documento_requisitos_responsavel_check
  CHECK (responsavel IN ('colaborador', 'empresa'));

COMMENT ON COLUMN public.dp_documento_requisitos.responsavel IS
  'Quem tem a obrigação de fornecer o documento: colaborador ou empresa. Itens da empresa nunca cobram pendência do colaborador.';

-- Documentos legados ficaram gravados fora do padrão empresa/colaborador
-- (ex.: documentos/adiantamento/...). Libera a leitura pelo vínculo em
-- dp_documentos, mantendo o escopo por empresa e por colaborador.
DROP POLICY IF EXISTS dp_doc_bucket_legacy_read ON storage.objects;
CREATE POLICY dp_doc_bucket_legacy_read
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'dp-documentos'
    AND name LIKE 'documentos/%'
    AND EXISTS (
      SELECT 1
      FROM public.dp_documentos d
      WHERE d.file_path = storage.objects.name
        AND (
          private.is_company_admin_or_owner(auth.uid(), d.company_id)
          OR public.is_super_admin(auth.uid())
          OR d.colaborador_id = public.dp_colaborador_ativo_of(auth.uid())
        )
    )
  );