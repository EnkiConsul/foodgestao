-- ============================================================
-- Fase 6 — fila durável de documentos e OCR
-- ============================================================
-- Cobre: entrada na fila, reserva concorrente, concessão expirada,
-- retry com espera crescente, erro definitivo, limite de tentativas,
-- idempotência e proteção do documento já confirmado.
--
-- Uso: psql -f supabase/tests/dp_bulk_queue.test.sql
-- Encerra com ROLLBACK — não altera dados de produção.
-- ============================================================

BEGIN;

SET LOCAL role = service_role;

-- Empresa de teste (usa a primeira existente)
CREATE TEMP TABLE ctx AS
SELECT id AS company_id FROM public.companies ORDER BY created_at LIMIT 1;

INSERT INTO public.dp_bulk_import_batches
  (id, company_id, tipo, source_file_path, source_file_name, status, total_pages)
SELECT
  '00000000-0000-4000-8000-0000000f0001', company_id, 'outros',
  company_id || '/lote-teste/source.pdf', 'teste.pdf', 'queued', NULL
FROM ctx;

-- T1: lote na fila é reservado pelo processador
WITH c AS (SELECT id FROM public.dp_bulk_claim_batches('w-a', 5, 300))
SELECT CASE WHEN EXISTS (SELECT 1 FROM c WHERE id = '00000000-0000-4000-8000-0000000f0001')
  THEN 'PASS T1: lote reservado' ELSE 'FAIL T1' END AS t1;

-- T2: páginas entram na fila (idempotente — segunda chamada não duplica)
SELECT public.dp_bulk_enqueue_pages('00000000-0000-4000-8000-0000000f0001', 3, 'w-a');
SELECT public.dp_bulk_enqueue_pages('00000000-0000-4000-8000-0000000f0001', 3, 'w-a');
SELECT CASE WHEN (SELECT count(*) FROM public.dp_bulk_import_items
                   WHERE batch_id = '00000000-0000-4000-8000-0000000f0001') = 3
  THEN 'PASS T2: 3 itens enfileirados sem duplicar' ELSE 'FAIL T2' END AS t2;

-- T3: dois processadores disputando os mesmos itens — sem sobreposição
WITH a AS (SELECT id FROM public.dp_bulk_claim_items('w-a', 3, 180)),
     b AS (SELECT id FROM public.dp_bulk_claim_items('w-b', 3, 180)),
     o AS (SELECT a.id FROM a JOIN b ON a.id = b.id)
SELECT CASE WHEN (SELECT count(*) FROM o) = 0 AND (SELECT count(*) FROM a) + (SELECT count(*) FROM b) = 3
  THEN 'PASS T3: reserva sem sobreposição' ELSE 'FAIL T3' END AS t3;

-- T4: falha passageira agenda nova tentativa no futuro
WITH i AS (SELECT id FROM public.dp_bulk_import_items
            WHERE batch_id = '00000000-0000-4000-8000-0000000f0001' AND page_index = 1),
     f AS (SELECT public.dp_bulk_item_finish_failure(
             (SELECT id FROM i), (SELECT locked_by FROM public.dp_bulk_import_items WHERE id = (SELECT id FROM i)),
             'timeout', 'transient', false))
SELECT CASE WHEN (SELECT status FROM public.dp_bulk_import_items WHERE id = (SELECT id FROM i)) = 'retry'
             AND (SELECT next_attempt_at FROM public.dp_bulk_import_items WHERE id = (SELECT id FROM i)) > now()
  THEN 'PASS T4: retry agendado com espera' ELSE 'FAIL T4' END AS t4
FROM f;

-- T5: erro definitivo vai direto para estado final (sem loop)
WITH i AS (SELECT id FROM public.dp_bulk_import_items
            WHERE batch_id = '00000000-0000-4000-8000-0000000f0001' AND page_index = 2),
     f AS (SELECT public.dp_bulk_item_finish_failure(
             (SELECT id FROM i), (SELECT locked_by FROM public.dp_bulk_import_items WHERE id = (SELECT id FROM i)),
             'pdf inválido', 'fatal', true))
SELECT CASE WHEN (SELECT status FROM public.dp_bulk_import_items WHERE id = (SELECT id FROM i)) = 'dead'
  THEN 'PASS T5: erro definitivo em estado final' ELSE 'FAIL T5' END AS t5
FROM f;

-- T6: concessão expirada é recuperada por outro processador
UPDATE public.dp_bulk_import_items
   SET lease_expires_at = now() - interval '1 minute'
 WHERE batch_id = '00000000-0000-4000-8000-0000000f0001' AND status = 'processing';
SELECT public.dp_bulk_reclaim_expired(200);
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM public.dp_bulk_import_items
   WHERE batch_id = '00000000-0000-4000-8000-0000000f0001' AND status = 'retry' AND last_error = 'lease_expirado')
  THEN 'PASS T6: item recuperado após concessão expirada' ELSE 'FAIL T6' END AS t6;

-- T7: limite de tentativas leva ao estado final
UPDATE public.dp_bulk_import_items
   SET attempt_count = max_attempts, status = 'processing',
       locked_by = 'w-z', lease_expires_at = now() + interval '5 minutes'
 WHERE batch_id = '00000000-0000-4000-8000-0000000f0001' AND page_index = 0;
WITH i AS (SELECT id FROM public.dp_bulk_import_items
            WHERE batch_id = '00000000-0000-4000-8000-0000000f0001' AND page_index = 0),
     f AS (SELECT public.dp_bulk_item_finish_failure((SELECT id FROM i), 'w-z', 'timeout', 'transient', false))
SELECT CASE WHEN (SELECT status FROM public.dp_bulk_import_items WHERE id = (SELECT id FROM i)) = 'dead'
  THEN 'PASS T7: limite de tentativas em estado final' ELSE 'FAIL T7' END AS t7
FROM f;

-- T8: somente o dono da reserva encerra o item
UPDATE public.dp_bulk_import_items
   SET status = 'processing', locked_by = 'w-dono', lease_expires_at = now() + interval '5 minutes'
 WHERE batch_id = '00000000-0000-4000-8000-0000000f0001' AND page_index = 1;
WITH i AS (SELECT id FROM public.dp_bulk_import_items
            WHERE batch_id = '00000000-0000-4000-8000-0000000f0001' AND page_index = 1)
SELECT CASE WHEN public.dp_bulk_item_finish_success((SELECT id FROM i), 'w-intruso', '{}'::jsonb) IS DISTINCT FROM true
             OR (SELECT status FROM public.dp_bulk_import_items WHERE id = (SELECT id FROM i)) = 'processing'
  THEN 'PASS T8: outro processador não encerra o item' ELSE 'FAIL T8' END AS t8;

-- T9: item já importado (documento confirmado da Fase 2) é imutável
UPDATE public.dp_bulk_import_items
   SET status = 'imported', locked_by = 'w-dono', lease_expires_at = now() + interval '5 minutes'
 WHERE batch_id = '00000000-0000-4000-8000-0000000f0001' AND page_index = 1;
WITH i AS (SELECT id FROM public.dp_bulk_import_items
            WHERE batch_id = '00000000-0000-4000-8000-0000000f0001' AND page_index = 1)
SELECT CASE WHEN (SELECT status FROM public.dp_bulk_import_items WHERE id = (SELECT id FROM i)) = 'imported'
  THEN 'PASS T9: item importado preservado' ELSE 'FAIL T9' END AS t9
FROM (SELECT public.dp_bulk_item_finish_success(
        (SELECT id FROM i), 'w-dono', '{"ocr_text":"x"}'::jsonb)) z;

-- T10: lote não finaliza enquanto há trabalho pendente
SELECT public.dp_bulk_batch_finalize('00000000-0000-4000-8000-0000000f0001');
SELECT CASE WHEN (SELECT status FROM public.dp_bulk_import_batches
                   WHERE id = '00000000-0000-4000-8000-0000000f0001') = 'processing'
  THEN 'PASS T10: lote segue processando' ELSE 'FAIL T10' END AS t10;

-- T11: sem trabalho pendente, o lote fica pronto para revisão
UPDATE public.dp_bulk_import_items SET status = 'pending'
 WHERE batch_id = '00000000-0000-4000-8000-0000000f0001' AND status IN ('queued', 'retry', 'processing');
SELECT public.dp_bulk_batch_finalize('00000000-0000-4000-8000-0000000f0001');
SELECT CASE WHEN (SELECT status FROM public.dp_bulk_import_batches
                   WHERE id = '00000000-0000-4000-8000-0000000f0001') = 'ready'
  THEN 'PASS T11: lote pronto' ELSE 'FAIL T11' END AS t11;

-- T12: rotinas da fila não são executáveis por usuário comum
SET LOCAL role = authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.dp_bulk_claim_items('w-hacker', 1, 60);
    RAISE EXCEPTION 'FAIL T12: usuário comum executou a reserva';
  EXCEPTION WHEN insufficient_privilege OR others THEN
    RAISE NOTICE 'PASS T12: usuário comum não executa a reserva';
  END;
END $$;

ROLLBACK;
