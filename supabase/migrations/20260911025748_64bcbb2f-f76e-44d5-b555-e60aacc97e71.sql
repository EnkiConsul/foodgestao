ALTER TABLE public.dp_bulk_import_batches
  ADD COLUMN IF NOT EXISTS rescisao_grupo_id uuid;

ALTER TABLE public.dp_documentos
  ADD COLUMN IF NOT EXISTS rescisao_grupo_id uuid;

CREATE INDEX IF NOT EXISTS idx_dp_bulk_import_batches_rescisao_grupo
  ON public.dp_bulk_import_batches (company_id, rescisao_grupo_id)
  WHERE rescisao_grupo_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dp_documentos_rescisao_grupo
  ON public.dp_documentos (company_id, colaborador_id, rescisao_grupo_id)
  WHERE rescisao_grupo_id IS NOT NULL;

COMMENT ON COLUMN public.dp_bulk_import_batches.rescisao_grupo_id IS
  'Identificador compartilhado pelos arquivos enviados juntos para a mesma rescisão.';
COMMENT ON COLUMN public.dp_documentos.rescisao_grupo_id IS
  'Identificador do conjunto de documentos da mesma rescisão.';