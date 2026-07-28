# Operações Rotineiras — Pluggy V2

## Cron jobs ativos

| Job | Frequência | Função |
|---|---|---|
| `pluggy-v2-worker-tick` | 1 min | Drena fila de webhooks |
| `pluggy-v2-remote-delete-tick` | 5 min | Retry `DELETE /items` na Pluggy |
| `pluggy-v2-alerts-tick` | 5 min | Avalia SLO e materializa alertas |
| `pluggy-expire-stale-connect-requests` | 15 min | Expira Connect Tokens não usados |
| `pluggy-v2-sync-release-stale` | 10 min | Libera sync_runs órfãos |

Verificar: `select jobname, schedule, active from cron.job where jobname like 'pluggy%';`

## Backfill V1 → V2

1. `/admin/pluggy-reconciliacao` → **Backfill V2** (super admin).
2. Confirma dry-run: lista itens elegíveis.
3. Executa: enumera `pluggy_item_id` V1 e chama `pluggy-v2-materialize` por item.
4. Após validação, mover a empresa via `pluggy_version='v2'`.

## Cleanup V1

Somente após 100% das empresas em V2 e período de observação ≥ 7 dias.

1. `/admin/pluggy-reconciliacao` → **Cleanup V1** (dry-run obrigatório).
2. Arquiva `open_finance_connections` da empresa.
3. Apaga `open_finance_transactions_raw` da empresa.
4. Não afeta `transactions` já reconciliadas.

## Rotação de segredos

- `PLUGGY_WEBHOOK_TOKEN`: gerar novo, atualizar via `pluggy-webhook-configure` (registra no dashboard Pluggy globalmente) e depois trocar o segredo no ambiente.
- `PLUGGY_CLIENT_SECRET`: gerar no dashboard Pluggy, atualizar env, redeploy edges.

## Smoke test manual

1. Conectar sandbox via `/contas-bancarias` → **Open Finance**.
2. Confirmar item em `/admin/pluggy-v2-conexoes` (status `updated` em ≤ 60s).
3. Conferir transações em `/lancamentos` filtradas por conta.
4. Desconectar → conferir `status='deleted'` e ausência remota (ver logs `remote-delete-worker`).
