-- ============================================================
-- Fase 6 — Fila durável de documentos e OCR
-- ============================================================

-- 1) Estados novos ------------------------------------------------------------
ALTER TABLE public.dp_bulk_import_items
  DROP CONSTRAINT IF EXISTS dp_bulk_import_items_status_check;
ALTER TABLE public.dp_bulk_import_items
  ADD CONSTRAINT dp_bulk_import_items_status_check
  CHECK (status = ANY (ARRAY[
    'queued'::text, 'processing'::text, 'retry'::text, 'dead'::text,
    'pending'::text, 'approved'::text, 'rejected'::text, 'imported'::text, 'failed'::text
  ]));

ALTER TABLE public.dp_bulk_import_batches
  DROP CONSTRAINT IF EXISTS dp_bulk_import_batches_status_check;
ALTER TABLE public.dp_bulk_import_batches
  ADD CONSTRAINT dp_bulk_import_batches_status_check
  CHECK (status = ANY (ARRAY[
    'queued'::text, 'processing'::text, 'ready'::text,
    'partially_imported'::text, 'imported'::text, 'failed'::text
  ]));

-- 2) Campos de fila ----------------------------------------------------------
ALTER TABLE public.dp_bulk_import_items
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by text,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS finished_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS error_class text;

ALTER TABLE public.dp_bulk_import_batches
  ADD COLUMN IF NOT EXISTS prep_locked_by text,
  ADD COLUMN IF NOT EXISTS prep_lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS prep_attempt_count integer NOT NULL DEFAULT 0;

-- Busca da fila (somente trabalho pendente)
CREATE INDEX IF NOT EXISTS dp_bulk_items_queue_idx
  ON public.dp_bulk_import_items (next_attempt_at NULLS FIRST, created_at)
  WHERE status IN ('queued', 'retry', 'processing');

CREATE INDEX IF NOT EXISTS dp_bulk_batches_queue_idx
  ON public.dp_bulk_import_batches (created_at)
  WHERE status = 'queued';

-- 3) Guarda de execução interna ---------------------------------------------
CREATE OR REPLACE FUNCTION private.dp_bulk_assert_service()
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
     AND coalesce(auth.role(), current_user) IS DISTINCT FROM 'service_role'
     AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'nao_autorizado';
  END IF;
END $$;

REVOKE ALL ON FUNCTION private.dp_bulk_assert_service() FROM PUBLIC;

-- 4) Reserva de lotes para preparação (split de páginas) --------------------
CREATE OR REPLACE FUNCTION public.dp_bulk_claim_batches(
  _worker text,
  _limit integer DEFAULT 2,
  _lease_seconds integer DEFAULT 300
)
RETURNS TABLE(
  id uuid, company_id uuid, tipo public.dp_documento_tipo,
  source_file_path text, source_file_name text, referencia_data date,
  deteccao_automatica boolean, exigir_aceite boolean, prep_attempt_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM private.dp_bulk_assert_service();

  RETURN QUERY
  WITH cand AS (
    SELECT b.id
      FROM public.dp_bulk_import_batches b
     WHERE b.status = 'queued'
       AND (b.prep_lease_expires_at IS NULL OR b.prep_lease_expires_at < now())
     ORDER BY b.created_at
     LIMIT greatest(_limit, 1)
     FOR UPDATE SKIP LOCKED
  ), upd AS (
    UPDATE public.dp_bulk_import_batches b
       SET prep_locked_by = _worker,
           prep_lease_expires_at = now() + make_interval(secs => greatest(_lease_seconds, 30)),
           prep_attempt_count = b.prep_attempt_count + 1,
           error_message = NULL
     WHERE b.id IN (SELECT cand.id FROM cand)
    RETURNING b.*
  )
  SELECT u.id, u.company_id, u.tipo, u.source_file_path, u.source_file_name,
         u.referencia_data, u.deteccao_automatica, u.exigir_aceite, u.prep_attempt_count
    FROM upd u;
END $$;

REVOKE ALL ON FUNCTION public.dp_bulk_claim_batches(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_bulk_claim_batches(text, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.dp_bulk_claim_batches(text, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.dp_bulk_claim_batches(text, integer, integer) TO service_role;

-- 5) Enfileira as páginas do lote (idempotente por lote+página) -------------
CREATE OR REPLACE FUNCTION public.dp_bulk_enqueue_pages(
  _batch_id uuid,
  _total_pages integer,
  _worker text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_inserted integer := 0;
BEGIN
  PERFORM private.dp_bulk_assert_service();

  SELECT company_id INTO v_company
    FROM public.dp_bulk_import_batches
   WHERE id = _batch_id
     AND (prep_locked_by IS NULL OR prep_locked_by = _worker)
   FOR UPDATE;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'lote_indisponivel';
  END IF;

  WITH ins AS (
    INSERT INTO public.dp_bulk_import_items
      (batch_id, company_id, page_index, page_file_path, status, confidence)
    SELECT _batch_id, v_company, p,
           v_company::text || '/' || _batch_id::text || '/page_' || p::text || '.pdf',
           'queued', 0
      FROM generate_series(1, greatest(_total_pages, 0)) AS p
    ON CONFLICT (batch_id, page_index) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM ins;

  UPDATE public.dp_bulk_import_batches
     SET status = 'processing',
         total_pages = greatest(_total_pages, 0),
         prep_locked_by = NULL,
         prep_lease_expires_at = NULL
   WHERE id = _batch_id;

  RETURN v_inserted;
END $$;

REVOKE ALL ON FUNCTION public.dp_bulk_enqueue_pages(uuid, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_bulk_enqueue_pages(uuid, integer, text) FROM anon;
REVOKE ALL ON FUNCTION public.dp_bulk_enqueue_pages(uuid, integer, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.dp_bulk_enqueue_pages(uuid, integer, text) TO service_role;

-- 6) Reserva atômica de páginas --------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_bulk_claim_items(
  _worker text,
  _limit integer DEFAULT 8,
  _lease_seconds integer DEFAULT 180
)
RETURNS TABLE(
  id uuid, batch_id uuid, company_id uuid, page_index integer,
  page_file_path text, attempt_count integer, max_attempts integer,
  batch_tipo public.dp_documento_tipo, batch_source_file_path text,
  batch_source_file_name text, batch_referencia_data date,
  batch_deteccao_automatica boolean, batch_exigir_aceite boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM private.dp_bulk_assert_service();

  RETURN QUERY
  WITH cand AS (
    SELECT i.id
      FROM public.dp_bulk_import_items i
     WHERE i.status IN ('queued', 'retry')
       AND (i.next_attempt_at IS NULL OR i.next_attempt_at <= now())
       AND (i.lease_expires_at IS NULL OR i.lease_expires_at < now())
     ORDER BY i.created_at, i.page_index
     LIMIT greatest(_limit, 1)
     FOR UPDATE SKIP LOCKED
  ), upd AS (
    UPDATE public.dp_bulk_import_items i
       SET status = 'processing',
           locked_by = _worker,
           lease_expires_at = now() + make_interval(secs => greatest(_lease_seconds, 30)),
           attempt_count = i.attempt_count + 1,
           started_at = now(),
           finished_at = NULL
     WHERE i.id IN (SELECT cand.id FROM cand)
    RETURNING i.*
  )
  SELECT u.id, u.batch_id, u.company_id, u.page_index, u.page_file_path,
         u.attempt_count, u.max_attempts,
         b.tipo, b.source_file_path, b.source_file_name, b.referencia_data,
         b.deteccao_automatica, b.exigir_aceite
    FROM upd u
    JOIN public.dp_bulk_import_batches b ON b.id = u.batch_id;
END $$;

REVOKE ALL ON FUNCTION public.dp_bulk_claim_items(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_bulk_claim_items(text, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.dp_bulk_claim_items(text, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.dp_bulk_claim_items(text, integer, integer) TO service_role;

-- 7) Encerramento com sucesso ---------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_bulk_item_finish_success(
  _item_id uuid,
  _worker text,
  _payload jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.dp_bulk_import_items;
BEGIN
  PERFORM private.dp_bulk_assert_service();

  SELECT * INTO v_row FROM public.dp_bulk_import_items
   WHERE id = _item_id FOR UPDATE;
  IF v_row.id IS NULL THEN RETURN false; END IF;

  -- Idempotência: decisão humana ou documento já gerado nunca é sobrescrito.
  IF v_row.status IN ('approved', 'rejected', 'imported')
     OR v_row.imported_documento_id IS NOT NULL THEN
    RETURN false;
  END IF;

  IF v_row.locked_by IS DISTINCT FROM _worker THEN
    RETURN false;
  END IF;

  UPDATE public.dp_bulk_import_items SET
    ocr_text                  = left(coalesce(_payload->>'ocr_text', ''), 8000),
    matched_cpf               = _payload->>'matched_cpf',
    matched_nome              = _payload->>'matched_nome',
    matched_colaborador_id    = nullif(_payload->>'matched_colaborador_id', '')::uuid,
    matched_colaborador_ativo = (_payload->>'matched_colaborador_ativo')::boolean,
    detected_cnpj             = _payload->>'detected_cnpj',
    detected_unidade_id       = nullif(_payload->>'detected_unidade_id', '')::uuid,
    detected_competencia      = _payload->>'detected_competencia',
    tipo_detectado            = nullif(_payload->>'tipo_detectado', '')::public.dp_documento_tipo,
    tipo_confidence           = coalesce((_payload->>'tipo_confidence')::numeric, 0),
    tipo_origem               = _payload->>'tipo_origem',
    tipo_assinatura           = _payload->>'tipo_assinatura',
    assinatura_detectada      = (_payload->>'assinatura_detectada')::boolean,
    assinatura_evidencia      = _payload->>'assinatura_evidencia',
    exige_aceite              = (_payload->>'exige_aceite')::boolean,
    duplicate_of              = nullif(_payload->>'duplicate_of', '')::uuid,
    confidence                = coalesce((_payload->>'confidence')::numeric, 0),
    status                    = 'pending',
    locked_by                 = NULL,
    lease_expires_at          = NULL,
    next_attempt_at           = NULL,
    last_error                = NULL,
    error_class               = NULL,
    finished_at               = now()
  WHERE id = _item_id;

  PERFORM public.dp_bulk_increment_processed(v_row.batch_id);
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.dp_bulk_item_finish_success(uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_bulk_item_finish_success(uuid, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.dp_bulk_item_finish_success(uuid, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.dp_bulk_item_finish_success(uuid, text, jsonb) TO service_role;

-- 8) Encerramento com falha (retry com espera crescente / estado final) ----
CREATE OR REPLACE FUNCTION public.dp_bulk_item_finish_failure(
  _item_id uuid,
  _worker text,
  _error text,
  _error_class text,
  _fatal boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.dp_bulk_import_items;
  v_status text;
  v_delay integer;
BEGIN
  PERFORM private.dp_bulk_assert_service();

  SELECT * INTO v_row FROM public.dp_bulk_import_items
   WHERE id = _item_id FOR UPDATE;
  IF v_row.id IS NULL THEN RETURN NULL; END IF;

  IF v_row.status IN ('approved', 'rejected', 'imported')
     OR v_row.imported_documento_id IS NOT NULL THEN
    RETURN v_row.status;
  END IF;

  IF v_row.locked_by IS DISTINCT FROM _worker THEN
    RETURN v_row.status;
  END IF;

  IF _fatal OR v_row.attempt_count >= v_row.max_attempts THEN
    v_status := CASE WHEN _fatal THEN 'failed' ELSE 'dead' END;
    UPDATE public.dp_bulk_import_items SET
      status = v_status,
      last_error = left(coalesce(_error, 'erro'), 300),
      error_message = left(coalesce(_error, 'erro'), 300),
      error_class = _error_class,
      locked_by = NULL,
      lease_expires_at = NULL,
      next_attempt_at = NULL,
      finished_at = now()
    WHERE id = _item_id;
    PERFORM public.dp_bulk_increment_processed(v_row.batch_id);
  ELSE
    v_status := 'retry';
    -- espera crescente: 30s, 60s, 120s, 240s… (limitada a 15 min)
    v_delay := least(30 * power(2, greatest(v_row.attempt_count - 1, 0))::integer, 900);
    UPDATE public.dp_bulk_import_items SET
      status = 'retry',
      last_error = left(coalesce(_error, 'erro'), 300),
      error_class = _error_class,
      locked_by = NULL,
      lease_expires_at = NULL,
      next_attempt_at = now() + make_interval(secs => v_delay),
      finished_at = now()
    WHERE id = _item_id;
  END IF;

  RETURN v_status;
END $$;

REVOKE ALL ON FUNCTION public.dp_bulk_item_finish_failure(uuid, text, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_bulk_item_finish_failure(uuid, text, text, text, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.dp_bulk_item_finish_failure(uuid, text, text, text, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.dp_bulk_item_finish_failure(uuid, text, text, text, boolean) TO service_role;

-- 9) Recuperação de reservas abandonadas ----------------------------------
CREATE OR REPLACE FUNCTION public.dp_bulk_reclaim_expired(_limit integer DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_items integer := 0;
  v_batches integer := 0;
BEGIN
  PERFORM private.dp_bulk_assert_service();

  WITH exp AS (
    SELECT id FROM public.dp_bulk_import_items
     WHERE status = 'processing'
       AND lease_expires_at IS NOT NULL
       AND lease_expires_at < now()
     ORDER BY lease_expires_at
     LIMIT greatest(_limit, 1)
     FOR UPDATE SKIP LOCKED
  ), upd AS (
    UPDATE public.dp_bulk_import_items i
       SET status = CASE WHEN i.attempt_count >= i.max_attempts THEN 'dead' ELSE 'retry' END,
           locked_by = NULL,
           lease_expires_at = NULL,
           next_attempt_at = now(),
           last_error = 'lease_expirado',
           error_class = 'transient'
     WHERE i.id IN (SELECT exp.id FROM exp)
    RETURNING 1
  )
  SELECT count(*) INTO v_items FROM upd;

  WITH expb AS (
    SELECT id FROM public.dp_bulk_import_batches
     WHERE status = 'queued'
       AND prep_lease_expires_at IS NOT NULL
       AND prep_lease_expires_at < now()
     ORDER BY prep_lease_expires_at
     LIMIT greatest(_limit, 1)
     FOR UPDATE SKIP LOCKED
  ), updb AS (
    UPDATE public.dp_bulk_import_batches b
       SET prep_locked_by = NULL,
           prep_lease_expires_at = NULL
     WHERE b.id IN (SELECT expb.id FROM expb)
    RETURNING 1
  )
  SELECT count(*) INTO v_batches FROM updb;

  RETURN jsonb_build_object('itens_recuperados', v_items, 'lotes_recuperados', v_batches);
END $$;

REVOKE ALL ON FUNCTION public.dp_bulk_reclaim_expired(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_bulk_reclaim_expired(integer) FROM anon;
REVOKE ALL ON FUNCTION public.dp_bulk_reclaim_expired(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.dp_bulk_reclaim_expired(integer) TO service_role;

-- 10) Finalização do lote --------------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_bulk_batch_finalize(_batch_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pendente integer;
  v_total integer;
  v_matched integer;
  v_unidades uuid[];
  v_status text;
BEGIN
  PERFORM private.dp_bulk_assert_service();

  SELECT status INTO v_status FROM public.dp_bulk_import_batches
   WHERE id = _batch_id FOR UPDATE;
  IF v_status IS NULL OR v_status <> 'processing' THEN
    RETURN v_status;
  END IF;

  SELECT count(*) FILTER (WHERE status IN ('queued', 'retry', 'processing')),
         count(*),
         count(*) FILTER (WHERE matched_colaborador_id IS NOT NULL)
    INTO v_pendente, v_total, v_matched
    FROM public.dp_bulk_import_items WHERE batch_id = _batch_id;

  IF v_total = 0 OR v_pendente > 0 THEN
    RETURN v_status;
  END IF;

  SELECT array_agg(DISTINCT detected_unidade_id)
    INTO v_unidades
    FROM public.dp_bulk_import_items
   WHERE batch_id = _batch_id AND detected_unidade_id IS NOT NULL;

  UPDATE public.dp_bulk_import_batches
     SET status = 'ready',
         matched_count = coalesce(v_matched, 0),
         processed_pages = v_total,
         unidade_id = CASE
           WHEN v_unidades IS NOT NULL AND array_length(v_unidades, 1) = 1
             THEN v_unidades[1] ELSE unidade_id END
   WHERE id = _batch_id;

  RETURN 'ready';
END $$;

REVOKE ALL ON FUNCTION public.dp_bulk_batch_finalize(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_bulk_batch_finalize(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.dp_bulk_batch_finalize(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.dp_bulk_batch_finalize(uuid) TO service_role;