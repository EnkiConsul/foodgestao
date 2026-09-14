-- ============================================================
-- Fase 6 — fila durável de documentos e OCR
-- ============================================================
-- Cobre: entrada na fila, enfileiramento idempotente das páginas, reserva
-- concorrente sem sobreposição, falha passageira com espera crescente, erro
-- definitivo, concessão expirada recuperada, limite de tentativas, encerramento
-- restrito ao dono da reserva, item já importado imutável (Fase 2) e
-- finalização do lote.
--
-- A negativa para visitante e para usuário comum está em
-- src/test/rls/fila_documentos.rls.test.ts.
--
-- Uso: rodar como serviço interno (role postgres/service_role).
-- Termina com RAISE EXCEPTION para desfazer tudo — não altera produção.
-- ============================================================

DO $$
DECLARE
  v_company uuid;
  v_batch uuid := '00000000-0000-4000-8000-0000000f0001';
  res text[] := '{}';
  n int;
  a int; b int; ov int;
  st text; nxt timestamptz;
  dono text;
BEGIN
  SELECT id INTO v_company FROM public.companies ORDER BY created_at LIMIT 1;

  INSERT INTO public.dp_bulk_import_batches
    (id, company_id, tipo, source_file_path, source_file_name, status)
  VALUES (v_batch, v_company, 'outros', v_company || '/lote-teste/source.pdf', 'teste.pdf', 'queued');

  -- T1: lote na fila é reservado
  SELECT count(*) INTO n FROM public.dp_bulk_claim_batches('w-a', 5, 300) c WHERE c.id = v_batch;
  res := res || CASE WHEN n = 1 THEN 'PASS T1' ELSE 'FAIL T1' END;

  -- T2: páginas entram na fila; segunda chamada não duplica
  PERFORM public.dp_bulk_enqueue_pages(v_batch, 3, 'w-a');
  PERFORM public.dp_bulk_enqueue_pages(v_batch, 3, 'w-a');
  SELECT count(*) INTO n FROM public.dp_bulk_import_items WHERE batch_id = v_batch;
  res := res || CASE WHEN n = 3 THEN 'PASS T2' ELSE 'FAIL T2 (' || n || ')' END;

  -- T3: dois processadores disputando — sem sobreposição
  CREATE TEMP TABLE _ca AS SELECT id FROM public.dp_bulk_claim_items('w-a', 3, 180);
  CREATE TEMP TABLE _cb AS SELECT id FROM public.dp_bulk_claim_items('w-b', 3, 180);
  SELECT count(*) INTO a FROM _ca;
  SELECT count(*) INTO b FROM _cb;
  SELECT count(*) INTO ov FROM _ca x JOIN _cb y ON x.id = y.id;
  res := res || CASE WHEN ov = 0 AND a + b = 3 THEN 'PASS T3' ELSE 'FAIL T3 (' || a || '/' || b || '/' || ov || ')' END;

  -- T4: falha passageira agenda nova tentativa no futuro
  SELECT locked_by INTO dono FROM public.dp_bulk_import_items WHERE batch_id = v_batch AND page_index = 1;
  PERFORM public.dp_bulk_item_finish_failure(
    (SELECT id FROM public.dp_bulk_import_items WHERE batch_id = v_batch AND page_index = 1),
    dono, 'timeout', 'transient', false);
  SELECT status, next_attempt_at INTO st, nxt
    FROM public.dp_bulk_import_items WHERE batch_id = v_batch AND page_index = 1;
  res := res || CASE WHEN st = 'retry' AND nxt > now() THEN 'PASS T4' ELSE 'FAIL T4 (' || st || ')' END;

  -- T5: erro definitivo vai direto ao estado final
  SELECT locked_by INTO dono FROM public.dp_bulk_import_items WHERE batch_id = v_batch AND page_index = 2;
  PERFORM public.dp_bulk_item_finish_failure(
    (SELECT id FROM public.dp_bulk_import_items WHERE batch_id = v_batch AND page_index = 2),
    dono, 'pdf invalido', 'fatal', true);
  SELECT status INTO st FROM public.dp_bulk_import_items WHERE batch_id = v_batch AND page_index = 2;
  res := res || CASE WHEN st = 'dead' THEN 'PASS T5' ELSE 'FAIL T5 (' || st || ')' END;

  -- T6: concessão expirada é recuperada
  UPDATE public.dp_bulk_import_items
     SET lease_expires_at = now() - interval '1 minute'
   WHERE batch_id = v_batch AND status = 'processing';
  PERFORM public.dp_bulk_reclaim_expired(200);
  SELECT count(*) INTO n FROM public.dp_bulk_import_items
   WHERE batch_id = v_batch AND status = 'retry' AND last_error = 'lease_expirado';
  res := res || CASE WHEN n >= 1 THEN 'PASS T6' ELSE 'FAIL T6' END;

  -- T7: limite de tentativas leva ao estado final
  UPDATE public.dp_bulk_import_items
     SET attempt_count = max_attempts, status = 'processing',
         locked_by = 'w-z', lease_expires_at = now() + interval '5 minutes'
   WHERE batch_id = v_batch AND page_index = 0;
  PERFORM public.dp_bulk_item_finish_failure(
    (SELECT id FROM public.dp_bulk_import_items WHERE batch_id = v_batch AND page_index = 0),
    'w-z', 'timeout', 'transient', false);
  SELECT status INTO st FROM public.dp_bulk_import_items WHERE batch_id = v_batch AND page_index = 0;
  res := res || CASE WHEN st = 'dead' THEN 'PASS T7' ELSE 'FAIL T7 (' || st || ')' END;

  -- T8: só o dono da reserva encerra o item
  UPDATE public.dp_bulk_import_items
     SET status = 'processing', locked_by = 'w-dono', lease_expires_at = now() + interval '5 minutes'
   WHERE batch_id = v_batch AND page_index = 1;
  PERFORM public.dp_bulk_item_finish_success(
    (SELECT id FROM public.dp_bulk_import_items WHERE batch_id = v_batch AND page_index = 1),
    'w-intruso', '{}'::jsonb);
  SELECT status INTO st FROM public.dp_bulk_import_items WHERE batch_id = v_batch AND page_index = 1;
  res := res || CASE WHEN st = 'processing' THEN 'PASS T8' ELSE 'FAIL T8 (' || st || ')' END;

  -- T9: item já importado (Fase 2) é imutável
  UPDATE public.dp_bulk_import_items SET status = 'imported' WHERE batch_id = v_batch AND page_index = 1;
  PERFORM public.dp_bulk_item_finish_success(
    (SELECT id FROM public.dp_bulk_import_items WHERE batch_id = v_batch AND page_index = 1),
    'w-dono', '{"ocr_text":"x"}'::jsonb);
  SELECT status INTO st FROM public.dp_bulk_import_items WHERE batch_id = v_batch AND page_index = 1;
  res := res || CASE WHEN st = 'imported' THEN 'PASS T9' ELSE 'FAIL T9 (' || st || ')' END;

  -- T10: lote não finaliza com trabalho pendente
  PERFORM public.dp_bulk_batch_finalize(v_batch);
  SELECT status INTO st FROM public.dp_bulk_import_batches WHERE id = v_batch;
  res := res || CASE WHEN st = 'processing' THEN 'PASS T10' ELSE 'FAIL T10 (' || st || ')' END;

  -- T11: sem trabalho pendente, lote fica pronto para revisão
  UPDATE public.dp_bulk_import_items SET status = 'pending'
   WHERE batch_id = v_batch AND status IN ('queued', 'retry', 'processing');
  PERFORM public.dp_bulk_batch_finalize(v_batch);
  SELECT status INTO st FROM public.dp_bulk_import_batches WHERE id = v_batch;
  res := res || CASE WHEN st = 'ready' THEN 'PASS T11' ELSE 'FAIL T11 (' || st || ')' END;

  RAISE EXCEPTION 'RESULTADO FILA: %', array_to_string(res, ' | ');
END $$;
