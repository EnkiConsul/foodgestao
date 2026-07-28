# SLO — Pluggy V2

## Objetivos

| Métrica | Alvo | Regra de alerta |
|---|---|---|
| Idade máx. webhook pending | ≤ 15 min | `webhook_oldest_pending_age > 15m` |
| Backlog webhook | < 100 | `webhook_backlog > 100` |
| Dead-letter | 0 crescente | `webhook_dead_letter > 0` |
| Sync travado | 0 | `sync_running_age > 30m` |
| Falha de sync (1h) | < 5% | `sync_error_rate_1h > 0.05` |
| Conexões em erro | < 2% | `connections_error_ratio > 0.02` |
| Retry de delete remoto | ≤ 5 tentativas | `remote_delete_max_attempts > 5` |
| Latência materialização | p95 < 60s | inspeção manual em `sync_runs.duration_ms` |

## Fontes

- RPC `pluggy_v2_slo_snapshot()` — snapshot pontual.
- Tabela `pluggy_v2_alerts` — histórico com dedup por `rule_key`.
- Cron `pluggy-v2-alerts-tick` (5 min) — avalia todas as regras.

## Escalonamento

1. Alerta aberto ≤ 30 min: verificar automáticamente no próximo tick.
2. Aberto > 30 min: acionar plantão de dados.
3. Aberto > 2h com `severity='critical'`: ativar rollback conforme runbook de incidente.

## Manutenção

- Revisar thresholds trimestralmente em `pluggy-v2-alerts/index.ts`.
- Auto-resolução em uma passada quando a métrica volta ao SLO.
