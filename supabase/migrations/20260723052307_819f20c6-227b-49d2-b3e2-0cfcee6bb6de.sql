ALTER TABLE public.dp_bulk_import_batches
  ADD COLUMN IF NOT EXISTS approved_count integer NOT NULL DEFAULT 0;