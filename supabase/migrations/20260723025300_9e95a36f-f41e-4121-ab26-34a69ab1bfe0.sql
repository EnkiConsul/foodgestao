ALTER TABLE public.dp_bulk_import_batches
  ADD COLUMN IF NOT EXISTS processed_pages integer NOT NULL DEFAULT 0;