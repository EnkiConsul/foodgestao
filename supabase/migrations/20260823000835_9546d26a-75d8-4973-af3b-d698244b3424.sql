-- Assinatura detectada e exigência de aceite por página/lote
ALTER TABLE public.dp_bulk_import_items
  ADD COLUMN IF NOT EXISTS assinatura_detectada boolean,
  ADD COLUMN IF NOT EXISTS assinatura_evidencia text,
  ADD COLUMN IF NOT EXISTS exige_aceite boolean,
  ADD COLUMN IF NOT EXISTS detected_unidade_id uuid REFERENCES public.dp_unidades(id) ON DELETE SET NULL;

ALTER TABLE public.dp_bulk_import_batches
  ADD COLUMN IF NOT EXISTS exigir_aceite boolean NOT NULL DEFAULT true;

ALTER TABLE public.dp_documentos
  ADD COLUMN IF NOT EXISTS unidade_id uuid REFERENCES public.dp_unidades(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assinatura_detectada boolean;

CREATE INDEX IF NOT EXISTS dp_documentos_unidade_idx ON public.dp_documentos(unidade_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_bulk_import_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_bulk_import_batches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_documentos TO authenticated;
GRANT ALL ON public.dp_bulk_import_items TO service_role;
GRANT ALL ON public.dp_bulk_import_batches TO service_role;
GRANT ALL ON public.dp_documentos TO service_role;