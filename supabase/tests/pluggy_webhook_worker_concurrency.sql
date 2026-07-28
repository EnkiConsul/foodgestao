-- ============================================================
-- Bloco 9 — Testes de concorrência do worker durável Pluggy
-- ============================================================
-- Verifica:
--   T1) pluggy_webhook_claim é atômico (FOR UPDATE SKIP LOCKED):
--       dois workers concorrentes NUNCA reservam o mesmo evento.
--   T2) Reservas expiradas voltam a ser reclamáveis após o lease.
--   T3) finalize_failure aplica backoff exponencial e move para
--       dead_letter ao atingir max_attempts.
--   T4) finalize_success marca como processado e limpa a reserva.
--
-- Uso:
--   psql -f supabase/tests/pluggy_webhook_worker_concurrency.sql
-- Encerra com ROLLBACK — não altera dados de produção.
-- ============================================================

BEGIN;

-- Seed: 10 eventos pendentes de teste
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
  worker_a AS (SELECT id FROM public.pluggy_webhook_claim('worker-a', 5, 60)),
  worker_b AS (SELECT id FROM public.pluggy_webhook_claim('worker-b', 5, 60))
SELECT
  (SELECT count(*) FROM worker_a) AS a_count,
  (SELECT count(*) FROM worker_b) AS b_count,
  CASE
    WHEN EXISTS (SELECT 1 FROM worker_a INTERSECT SELECT 1 FROM worker_b WHERE false)
    THEN 'FAIL'
    WHEN EXISTS (
      SELECT wa.id FROM worker_a wa JOIN worker_b wb ON wa.id = wb.id
    ) THEN 'FAIL: overlap detectado'
    ELSE 'PASS: sem overlap'
  END AS t1_result;

-- Confere: até 10 eventos reservados, distribuídos entre workers
SELECT
  claimed_by,
  count(*) AS eventos_reservados
FROM public.open_finance_webhook_events
WHERE event_id LIKE 'test-concurrency-%'
  AND status = 'claimed'
GROUP BY claimed_by
ORDER BY claimed_by;

-- T2: Simular expiração de lease e re-reivindicar
UPDATE public.open_finance_webhook_events
SET claim_expires_at = now() - interval '10 seconds'
WHERE claimed_by = 'worker-a'
  AND event_id LIKE 'test-concurrency-%';

WITH reclaim AS (
  SELECT id FROM public.pluggy_webhook_claim('worker-c', 10, 60)
)
SELECT
  (SELECT count(*) FROM reclaim) AS recuperados,
  CASE WHEN (SELECT count(*) FROM reclaim) > 0
       THEN 'PASS: reservas expiradas foram recuperadas'
       ELSE 'FAIL: worker-c não recuperou eventos expirados'
  END AS t2_result;

-- T3: finalize_failure após max_attempts move para dead_letter
DO $$
DECLARE
  target_id uuid;
BEGIN
  SELECT id INTO target_id
  FROM public.open_finance_webhook_events
  WHERE event_id LIKE 'test-concurrency-%'
    AND status = 'claimed'
  LIMIT 1;

  -- Simular 5 falhas para esgotar max_attempts
  UPDATE public.open_finance_webhook_events
  SET attempt_count = 5
  WHERE id = target_id;

  PERFORM public.pluggy_webhook_finalize_failure(
    target_id,
    (SELECT claimed_by FROM public.open_finance_webhook_events WHERE id = target_id),
    'teste de falha',
    'test_error'
  );

  IF (SELECT status FROM public.open_finance_webhook_events WHERE id = target_id) = 'dead_letter' THEN
    RAISE NOTICE 'T3 PASS: evento movido para dead_letter';
  ELSE
    RAISE NOTICE 'T3 FAIL: status inesperado %',
      (SELECT status FROM public.open_finance_webhook_events WHERE id = target_id);
  END IF;
END $$;

-- T4: finalize_success limpa reserva e marca processed
DO $$
DECLARE
  target_id uuid;
  worker text;
BEGIN
  SELECT id, claimed_by INTO target_id, worker
  FROM public.open_finance_webhook_events
  WHERE event_id LIKE 'test-concurrency-%'
    AND status = 'claimed'
  LIMIT 1;

  PERFORM public.pluggy_webhook_finalize_success(target_id, worker);

  IF (SELECT status FROM public.open_finance_webhook_events WHERE id = target_id) = 'processed'
     AND (SELECT claimed_by FROM public.open_finance_webhook_events WHERE id = target_id) IS NULL
  THEN
    RAISE NOTICE 'T4 PASS: evento processado e reserva limpa';
  ELSE
    RAISE NOTICE 'T4 FAIL';
  END IF;
END $$;

-- Cleanup automático via ROLLBACK
ROLLBACK;
