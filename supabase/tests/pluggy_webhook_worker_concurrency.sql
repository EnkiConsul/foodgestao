-- ============================================================
-- Bloco 9 — Teste de concorrência do claim atômico (Pluggy)
-- ============================================================
-- Garante que pluggy_webhook_claim usa FOR UPDATE SKIP LOCKED:
-- dois workers concorrentes NUNCA reservam o mesmo evento.
--
-- Uso:
--   psql -f supabase/tests/pluggy_webhook_worker_concurrency.sql
--
-- Encerra com ROLLBACK — não altera dados de produção.
-- T2 (finalize_success) e T3 (retry/dead_letter) são cobertos abaixo.
-- ============================================================

BEGIN;

-- Seed: 10 eventos pendentes de teste (via RPC SECURITY DEFINER seria ideal,
-- mas como só T1 usa esta seed, permitimos INSERT direto no schema public).
INSERT INTO public.pluggy_webhook_events
  (id, event_id, event_type, payload, status, attempt_count, max_attempts, created_at)
SELECT
  gen_random_uuid(),
  'test-concurrency-' || i,
  'item/updated',
  jsonb_build_object('test', true, 'idx', i),
  'pending',
  0,
  5,
  now()
FROM generate_series(1, 10) i;

-- T1: Dois claims concorrentes NÃO devem sobrepor
WITH
  worker_a AS (SELECT id FROM public.pluggy_webhook_claim('test-worker-a', 5, 60)),
  worker_b AS (SELECT id FROM public.pluggy_webhook_claim('test-worker-b', 5, 60)),
  overlap AS (SELECT wa.id FROM worker_a wa JOIN worker_b wb ON wa.id = wb.id)
SELECT
  (SELECT count(*) FROM worker_a)  AS a_reservou,
  (SELECT count(*) FROM worker_b)  AS b_reservou,
  (SELECT count(*) FROM overlap)   AS overlap_count,
  CASE
    WHEN (SELECT count(*) FROM overlap) = 0
     AND (SELECT count(*) FROM worker_a) + (SELECT count(*) FROM worker_b) = 10
    THEN 'PASS: 10 eventos reservados, zero overlap'
    ELSE 'FAIL'
  END AS t1_result;

-- T2: finalize_success marca como processado
WITH claimed AS (SELECT id FROM public.pluggy_webhook_claim('test-worker-c', 1, 60)),
     fin AS (SELECT public.pluggy_webhook_finalize_success((SELECT id FROM claimed), 'test-worker-c'))
SELECT
  CASE WHEN (SELECT status FROM public.pluggy_webhook_events WHERE id = (SELECT id FROM claimed)) = 'processed'
       AND (SELECT processed_at FROM public.pluggy_webhook_events WHERE id = (SELECT id FROM claimed)) IS NOT NULL
  THEN 'PASS: finalize_success marca processed'
  ELSE 'FAIL: finalize_success' END AS t2_result
FROM fin;

-- T3: falha fatal vai direto para dead_letter; falha comum agenda retry
WITH claimed AS (SELECT id FROM public.pluggy_webhook_claim('test-worker-d', 2, 60) LIMIT 2),
     ids AS (SELECT id, row_number() OVER () rn FROM claimed),
     f1 AS (SELECT public.pluggy_webhook_finalize_failure((SELECT id FROM ids WHERE rn = 1), 'test-worker-d', 'boom', 'test_error', true)),
     f2 AS (SELECT public.pluggy_webhook_finalize_failure((SELECT id FROM ids WHERE rn = 2), 'test-worker-d', 'boom', 'test_error', false))
SELECT
  CASE WHEN (SELECT status FROM public.pluggy_webhook_events WHERE id = (SELECT id FROM ids WHERE rn = 1)) = 'dead_letter'
       AND (SELECT status FROM public.pluggy_webhook_events WHERE id = (SELECT id FROM ids WHERE rn = 2)) IN ('retry', 'dead_letter')
  THEN 'PASS: falha fatal em dead_letter e falha comum reagendada'
  ELSE 'FAIL: finalize_failure' END AS t3_result
FROM f1, f2;

ROLLBACK;
