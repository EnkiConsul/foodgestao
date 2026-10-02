CREATE OR REPLACE FUNCTION public.dp_bulk_item_finish_success(_item_id uuid, _worker text, _payload jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.dp_bulk_import_items;
  v_liq bigint;
BEGIN
  PERFORM private.dp_bulk_assert_service();

  SELECT * INTO v_row FROM public.dp_bulk_import_items
   WHERE id = _item_id FOR UPDATE;
  IF v_row.id IS NULL THEN RETURN false; END IF;

  IF v_row.status IN ('approved', 'rejected', 'imported')
     OR v_row.imported_documento_id IS NOT NULL THEN
    RETURN false;
  END IF;

  IF v_row.locked_by IS DISTINCT FROM _worker THEN
    RETURN false;
  END IF;

  v_liq := nullif(_payload->>'valor_liquido_cents', '')::bigint;
  IF v_liq IS NOT NULL AND (v_liq <= 0 OR v_liq > 100000000) THEN v_liq := NULL; END IF;

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
    valor_liquido_cents       = v_liq,
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
END $function$;