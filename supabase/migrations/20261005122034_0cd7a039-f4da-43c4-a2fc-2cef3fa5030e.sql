CREATE OR REPLACE FUNCTION public.dp_bulk_reprocessar_lote(_batch_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company uuid;
  v_n integer;
BEGIN
  SELECT company_id INTO v_company FROM public.dp_bulk_import_batches WHERE id = _batch_id FOR UPDATE;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Lote não encontrado.';
  END IF;
  IF NOT public.tem_permissao(v_company, 'dp.documentos', 'inclusao') THEN
    RAISE EXCEPTION 'Você não tem permissão para reprocessar este lote.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.dp_bulk_import_items SET
    status = 'queued', attempt_count = 0, next_attempt_at = NULL,
    locked_by = NULL, lease_expires_at = NULL, started_at = NULL, finished_at = NULL,
    last_error = NULL, error_message = NULL, error_class = NULL
  WHERE batch_id = _batch_id
    AND status IN ('failed', 'dead')
    AND imported_documento_id IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  IF v_n = 0 THEN
    RAISE EXCEPTION 'Não há páginas com falha para reprocessar neste lote.';
  END IF;

  UPDATE public.dp_bulk_import_batches SET
    status = 'processing',
    processed_pages = greatest(coalesce(processed_pages, 0) - v_n, 0),
    error_message = NULL,
    updated_at = now()
  WHERE id = _batch_id;

  RETURN v_n;
END $$;

REVOKE ALL ON FUNCTION public.dp_bulk_reprocessar_lote(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_bulk_reprocessar_lote(uuid) TO authenticated, service_role;