
ALTER TABLE public.dp_bulk_import_items
  ADD COLUMN IF NOT EXISTS matched_colaborador_ativo boolean,
  ADD COLUMN IF NOT EXISTS duplicate_of uuid REFERENCES public.dp_documentos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS detected_cnpj text,
  ADD COLUMN IF NOT EXISTS detected_competencia text,
  ADD COLUMN IF NOT EXISTS page_thumb_url text;

CREATE INDEX IF NOT EXISTS idx_dp_documentos_colab_tipo_ref
  ON public.dp_documentos (colaborador_id, tipo, referencia_data);
