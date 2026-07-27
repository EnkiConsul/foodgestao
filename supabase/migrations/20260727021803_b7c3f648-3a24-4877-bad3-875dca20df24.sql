ALTER TABLE public.dp_bulk_import_batches
  ADD COLUMN IF NOT EXISTS unidade_id uuid REFERENCES public.dp_unidades(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS dp_bulk_batch_unidade_idx
  ON public.dp_bulk_import_batches (unidade_id);