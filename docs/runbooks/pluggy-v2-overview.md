# Pluggy V2 — Visão Geral Operacional

Stack isolada em `pluggy_v2_*` que substitui a integração V1 (Open Finance).
Todo o fluxo passa por webhook global + worker durável + materializador cursor `/v2/transactions`.

## Componentes

| Camada | Nome | Descrição |
|---|---|---|
| Ingestão | `pluggy-v2-webhook` | Recebe eventos Pluggy, valida token, enfileira em `pluggy_v2_webhook_events`. |
| Worker | `pluggy-v2-worker` | Consome fila via `pluggy_v2_webhook_claim` (SKIP LOCKED) e materializa item. |
| Materializador | `pluggy-v2-materialize` | Reconstrói item + contas + transações via cursor v2. |
| Retry remoto | `pluggy-v2-remote-delete-worker` | Backoff exponencial para `DELETE /items/{id}` na Pluggy. |
| Backfill | `pluggy-v2-backfill` | Re-materializa itens da V1 na V2 (super admin). |
| Cleanup | `pluggy-v1-cleanup` | Arquiva V1 após cutover confirmado. |
| Observabilidade | `pluggy-v2-alerts` | Avalia SLO e grava alertas em `pluggy_v2_alerts`. |

## Painéis Admin

- `/admin/pluggy-v2-conexoes` — estado de conexões e itens
- `/admin/pluggy-v2-webhook-logs` — fila, dead-letter, replays
- `/admin/pluggy-v2-alertas` — SLO snapshot + histórico de alertas
- `/admin/pluggy-reconciliacao` — Cutover, Backfill e Cleanup V1

## Feature flag

`pluggy_version` (per company) — `v1` | `v2`. Default: `v2`.
`PLUGGY_V1_FROZEN=true` bloqueia escrita no stack legado.

## Segredos

- `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`
- `PLUGGY_WEBHOOK_TOKEN` (fail-closed)
- `PLUGGY_CRON_TICK_SECRET`
- `PLUGGY_USE_GLOBAL_WEBHOOK=true`
