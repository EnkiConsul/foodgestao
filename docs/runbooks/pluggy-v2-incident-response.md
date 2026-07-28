# Runbook — Resposta a Incidentes Pluggy V2

## 1. Backlog de webhook alto (`webhook_backlog_high`)

**Sintoma:** `pluggy_v2_webhook_events` com mais de 100 eventos `pending`, ou o mais antigo > 15 min.

**Diagnóstico:**
1. Abrir `/admin/pluggy-v2-alertas` e confirmar métrica `webhook_oldest_pending_age`.
2. Verificar logs da Edge Function `pluggy-v2-worker` (últimos 15 min).
3. Checar se `pg_cron` está executando `pluggy-v2-worker-tick`:
   ```sql
   select * from cron.job where jobname like 'pluggy-v2-%';
   select * from cron.job_run_details order by start_time desc limit 20;
   ```

**Ação:**
- Se worker travado: invocar manualmente via botão **Reprocessar** no painel.
- Se erro de token Pluggy: rotacionar `PLUGGY_CLIENT_SECRET`.
- Se dead-letter: mover para `pending` via botão **Reenfileirar**.

## 2. Sync travado (`sync_stuck`)

**Sintoma:** `pluggy_v2_sync_runs.status = 'running'` há mais de 30 min.

**Ação:**
1. RPC `pluggy_v2_sync_release_stale()` libera runs órfãos.
2. Se persistente, forçar re-materialização via `/admin/pluggy-v2-conexoes` → **Re-sync**.

## 3. Dead-letter (`webhook_dead_letter`)

**Sintoma:** eventos com `status='dead_letter'` (>5 tentativas).

**Ação:**
1. Inspecionar `last_error` no painel.
2. Corrigir causa raiz (schema, credencial, item removido).
3. Botão **Reenfileirar** individual ou em lote.

## 4. Item removido remotamente

Pluggy pode remover itens (usuário revoga no banco). O worker marca `status='deleted'` e dispara `pluggy-v2-remote-delete-worker` para limpar contrapartida.

## 5. Rollback V2 → V1 (emergencial)

1. Setar `pluggy_version='v1'` na empresa afetada via `/admin/pluggy-reconciliacao`.
2. Reverter `PLUGGY_V1_FROZEN=false`.
3. Confirmar que Connect Tokens antigos ainda respondem.
