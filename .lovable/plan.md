# Auditoria — Sincronização Pluggy / Open Finance

Objetivo: verificar, sem alterar código, se a entrega dos 10 blocos atende aos critérios de aceite do prompt P0 e produzir um relatório de conformidade com evidências.

## Escopo

Somente leitura: código, migrations, banco (via `supabase--read_query`), linter, secrets, cron. Nenhuma alteração de arquivo, schema ou dado.

## Etapas

1. **Inventário de código** — ler:
   - `supabase/functions/_shared/pluggy-client.ts`
   - `supabase/functions/_shared/materialize-pluggy-item.ts` (se existir)
   - `supabase/functions/pluggy-connect-token/index.ts`
   - `supabase/functions/pluggy-item-register/index.ts`
   - `supabase/functions/pluggy-webhook/index.ts`
   - `supabase/functions/pluggy-worker/index.ts`
   - `supabase/functions/pluggy-sync/index.ts`
   - `supabase/functions/pluggy-item-delete/index.ts` (se existir)
   - `supabase/config.toml`
   - `src/components/accounts/OpenFinanceWizard.tsx`
   - `src/pages/ConexoesOpenFinance.tsx`, `src/pages/ConciliacaoOpenFinance.tsx`
   - `src/hooks/useOpenFinance.ts`, `src/hooks/useRealtimeSync.tsx`

2. **Inventário de schema** — via `supabase--read_query`:
   - Colunas, índices e constraints de `open_finance_connection_requests`, `open_finance_connections`, `open_finance_accounts`, `open_finance_webhook_events`, `open_finance_sync_runs`, `open_finance_transactions_raw`
   - Uniques exigidos: `(provider, event_id)`, `(provider, pluggy_item_id)`, `(connection_id, pluggy_account_id)`, `(provider, company_id, pluggy_transaction_id)`
   - RLS/GRANTs de cada tabela (anon/authenticated/service_role)
   - Funções: `claim_open_finance_sync`, `release_open_finance_sync`, `create_and_link_open_finance_account`, `promote_open_finance_raw_ids`, `ignore_open_finance_raw`, `disconnect_open_finance_connection`, `classify_open_finance_item_state`

3. **Cron real** — `SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE '%pluggy%'` e histórico recente em `cron.job_run_details`.

4. **Estado runtime** — contagens agregadas (sem dados sensíveis): eventos por status, sync_runs por status, dead_letter > 0, idade do evento pendente mais antigo, conexões por status.

5. **Secrets** — `fetch_secrets` para confirmar `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`, `PLUGGY_WEBHOOK_TOKEN`/`PLUGGY_WEBHOOK_SECRET`.

6. **Linter** — `supabase--linter` filtrando achados relacionados ao domínio Open Finance.

## Entregável

Um único relatório em chat com uma tabela por critério do item 32 do prompt:

```text
Critério                                     | Status | Evidência
---------------------------------------------|--------|---------------------------
Request criado antes do Connect Token         | ok/gap | arquivo:linhas
clientUserId = ofreq:<request_id>             | ok/gap | ...
Payload usa options                           | ok/gap |
Webhook com header secreto                    | ok/gap |
eventId idempotente (unique)                  | ok/gap | constraint
Receiver responde <500ms (waitUntil)          | ok/gap |
Conexão independente do navegador             | ok/gap |
Item consultado pelo backend                  | ok/gap |
Contas atualizadas                            | ok/gap |
Transações por cursor                         | ok/gap |
transactions/updated refletido                | ok/gap |
transactions/deleted tratado                  | ok/gap |
Worker com retry + backoff                    | ok/gap |
Recuperação de lease expirado                 | ok/gap |
Dead letter                                   | ok/gap |
Cron agendado (evidência em cron.job)         | ok/gap |
Desconexão remota DELETE /items               | ok/gap |
Status canônicos consistentes                 | ok/gap |
Cross-tenant bloqueado                        | ok/gap |
Uniques cross-tenant no schema                | ok/gap |
```

Cada linha com gap terá recomendação objetiva e severidade (P0/P1/P2). Nenhuma correção será aplicada nesta rodada — a próxima decisão fica com você a partir do relatório.

## Fora de escopo

- Qualquer edição de código, migration ou dado
- Alterar wizard, conciliação, DP, DRE, motor financeiro
- Testes end-to-end em produção (item separado)
