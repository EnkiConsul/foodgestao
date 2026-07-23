
CREATE OR REPLACE FUNCTION public.dp_bulk_increment_processed(p_batch_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.dp_bulk_import_batches
  SET processed_pages = LEAST(
        COALESCE(total_pages, processed_pages + 1),
        COALESCE(processed_pages, 0) + 1
      )
  WHERE id = p_batch_id;
$$;

REVOKE ALL ON FUNCTION public.dp_bulk_increment_processed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_bulk_increment_processed(uuid) TO service_role;
