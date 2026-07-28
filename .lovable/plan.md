# P0 — Materializar Item Pluggy pelo Webhook (sem depender do onSuccess)

## 1. Diagnóstico da estrutura atual

**Já existe** (não vamos duplicar):
- `pluggy-item-materialize` já é um helper server-side com upsert idempotente de conexão + contas + sync_run inicial.
- Webhook (`pluggy-webhook`) já chama `pluggy-item-materialize` para `item/created`/`item/updated` quando não há conexão local.
- Tabelas com colunas certas: `open_finance_connection_requests` já tem `correlation_expires_at`, `mode`, `existing_connection_id`, `error_code`, `cancelled_at`, `completed_at`. `open_finance_accounts` tem `removed_at` + unique(connection_id, pluggy_account_id). `open_finance_webhook_events` tem unique(event_id) + `processed_at`.
- `pluggy-item-register` (fast-path do onSuccess) mantém uma **segunda implementação** de materialização, que precisa convergir com o helper.

**Faltando / incorreto:**
- `pluggy_item_id` em `open_finance_connections` só é único **por company** (`unique(company_id, pluggy_item_id)`). Não há proteção global cross-tenant.
- Webhook resolve a request só se **já existe** conexão; se webhook chega antes do onSuccess (ou onSuccess nunca chega), a resolução de tenant depende de `client_user_id` passado no payload — mas o payload nem sempre traz `clientUserId` e não é chamado `GET /items/{itemId}` antes de decidir company.
- `open_finance_webhook_events` não tem `status/attempt_count/next_attempt_at/company_id/connection_id/connection_request_id/client_user_id/last_error_code` — sem isso não dá para reprocessar de forma recuperável.
- `pluggy-item-materialize` faz `.upsert` em `open_finance_sync_runs` **sem verificar** se já existe queued/running — pode enfileirar múltiplos syncs iniciais.
- `pluggy-item-materialize` não valida `correlation_expires_at`, `cancelled_at`, nem detecta conflito cross-tenant antes de escrever.
- Frontend (`OpenFinanceWizard.tsx`) hoje só confia no `onSuccess`. Não faz polling do `request_id`.
- `pluggy-item-register` continua fazendo a materialização inline em vez de chamar o helper.

## 2. Arquivos que serão modificados

**Backend (Edge Functions):**
- `supabase/functions/_shared/materialize-pluggy-item.ts` — **novo** helper compartilhado
- `supabase/functions/pluggy-webhook/index.ts` — persistência com `status`, chamada do helper, retry
- `supabase/functions/pluggy-item-materialize/index.ts` — refatorado para invocar o helper (mantém contrato HTTP)
- `supabase/functions/pluggy-item-register/index.ts` — passa a chamar o helper compartilhado
- `supabase/functions/pluggy-webhook-drain/index.ts` — **novo** endpoint para cron reprocessar eventos `pending`/`retry`

**Migration (uma só):**
- `supabase/migrations/<ts>_pluggy_webhook_recovery.sql`

**Frontend:**
- `src/components/accounts/OpenFinanceWizard.tsx` — polling da solicitação (`open_finance_connection_requests`) via Realtime + fallback com `setInterval`; mensagens quando fecha widget/USER_AUTHORIZATION_PENDING; `onSuccess` continua chamando `pluggy-item-register` como atalho mas sem ser fonte de verdade.

**Testes (Deno):**
- `supabase/functions/_shared/materialize-pluggy-item_test.ts` cobrindo os 12 casos exigidos com mocks do cliente Pluggy e supabase-js.

## 3. Migration necessária

Único arquivo SQL contendo, com `IF NOT EXISTS` para ser reexecutável:

1. Colunas em `open_finance_webhook_events`: `status text default 'pending'` (values: pending/processing/processed/retry/failed), `company_id uuid`, `connection_id uuid`, `connection_request_id uuid`, `client_user_id text`, `next_attempt_at timestamptz`, `attempt_count int default 0`, `last_error_code text`. Backfill: `processed_at not null` → `status='processed'`.
2. Índice `idx_of_webhook_events_ready` em `(next_attempt_at)` where status in ('pending','retry').
3. **Unique global** em `open_finance_connections(pluggy_item_id)` — antes, `SELECT` de diagnóstico; se retornar linhas, a migration aborta com `RAISE EXCEPTION` (não apaga dados). A constraint existente `(company_id, pluggy_item_id)` continua.
4. Partial unique em `open_finance_sync_runs(connection_id) WHERE status IN ('queued','running') AND triggered_by IN ('webhook:item/created','item_register','materialize')`.
5. Enum-check em `open_finance_connection_requests.status` incluindo `materializing`, `awaiting_authorization`.

Nenhum `DELETE`/`UPDATE` destrutivo — só `ALTER TABLE ADD COLUMN` idempotente e criação de índices.

## 4. Fluxo antes × depois

**Antes**
```text
widget -> onSuccess -> pluggy-item-register -> materializa
                                             \-> se falhar, tudo trava
webhook -> se conexão existe: enfileira sync
        -> senão: chama materialize com client_user_id do payload
                  (que pode não vir)
```

**Depois**
```text
widget -> onSuccess (opcional, fast-path)
                \-> pluggy-item-register -> materializePluggyItem()
                                                  \-> alreadyMaterialized OK
webhook -> insere event(status=pending) -> ACK 2XX
        -> processEvent:
             GET /items/{id}
             clientUserId = item.clientUserId ?? payload.clientUserId
             valida ofreq:<uuid> -> request -> company_id
             materializePluggyItem() (mesmo helper)
             marca event.processed / event.retry
drain cron -> reprocessa events status in (pending, retry)
frontend -> polling/realtime em open_finance_connection_requests
         -> quando status='connected' avança sem esperar onSuccess
```

## 5. Riscos de compatibilidade

- Adicionar unique global em `pluggy_item_id`: só passa se hoje não houver o mesmo item em empresas distintas. Migration faz `SELECT` de diagnóstico e aborta em vez de forçar. Já verifiquei: hoje a tabela está vazia.
- Novas colunas em `webhook_events` têm default seguro; backfill preserva histórico.
- Contrato HTTP das funções existentes não muda; só a implementação interna.
- Frontend continua funcionando com `onSuccess`; polling é aditivo.

## 6. Confirmação de não-destruição

Nenhum `DELETE`, `TRUNCATE`, `DROP TABLE` ou `DROP COLUMN`. Migrations somente aditivas + índices. Se detectar duplicidade cross-tenant existente, aborta e devolve o diagnóstico para revisão manual.

---

## Detalhes técnicos (referência de implementação)

- Helper `materializePluggyItem` idempotente por `pluggy_item_id`, valida `ofreq:` regex, checa `correlation_expires_at > now()` e `cancelled_at IS NULL`, faz upsert de connection/accounts e enfileira sync inicial somente se não existir queued/running.
- Códigos de erro seguros: `missing_client_user_id`, `invalid_client_user_id`, `request_not_found`, `correlation_expired`, `request_cancelled`, `request_item_mismatch`, `item_company_conflict`, `item_fetch_failed`, `accounts_fetch_failed`, `connection_upsert_failed`.
- `pluggy-webhook` marca `status='processing'` ao iniciar; em falha transitória `status='retry'`, `attempt_count++`, `next_attempt_at = now() + exp_backoff(attempt)`; em sucesso `status='processed'`, `processed_at=now()` e preenche `connection_id`/`company_id`.
- Drain: `pluggy-webhook-drain` seleciona eventos `pending`/`retry` com `next_attempt_at <= now()` e reexecuta o mesmo `processEvent`.
- Testes Deno usam stubs de `getItem`/`listAccounts` e client Supabase mockado; rodam via `bunx vitest` ou `deno test` conforme padrão do projeto (o helper é puro o suficiente para testar sem rede).
- Consultas de validação (A–E do prompt) rodadas ao final via `supabase--read_query` e reportadas.
