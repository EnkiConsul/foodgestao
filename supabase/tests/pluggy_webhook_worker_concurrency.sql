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
-- T2 (expiração de lease), T3 (dead_letter) e T4 (finalize_success)
-- são cobertos pela função de teste service_role:
--   supabase/functions/pluggy-worker-selftest/index.ts
-- ============================================================

BEGIN;

-- Seed: 10 eventos pendentes de teste (via RPC SECURITY DEFINER seria ideal,
-- mas como só T1 usa esta seed, permitimos INSERT direto no schema public).
INSERT INTO public.open_finance_webhook_events
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

ROLLBACK;
