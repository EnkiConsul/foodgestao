
# Integração Open Finance via Pluggy — Extrato Automático

**Decisões confirmadas:** Pluggy · produção · PF e PJ · sync diário automático (+ manual sob demanda).

## Pré-requisitos (fora do código)
1. Criar conta em https://dashboard.pluggy.ai e obter `CLIENT_ID` e `CLIENT_SECRET` de **produção**.
2. Contratar plano Pluggy (produção cobra por item ativo/mês).
3. Guardar segredos: `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`, `PLUGGY_WEBHOOK_SECRET`.

## 1. Migration (schema)

```text
bank_connections
  id, user_id, company_id (null=PF), context ('pf'|'pj'),
  provider ('pluggy'), provider_item_id (unique),
  institution_name, institution_logo_url,
  status ('active'|'updating'|'login_error'|'outdated'|'consent_expired'),
  consent_expires_at, last_sync_at, last_error, created_at, updated_at

bank_connection_accounts
  id, connection_id (fk), provider_account_id (unique per connection),
  provider_type, provider_subtype, provider_name, provider_number,
  account_id (fk accounts, nullable — usuário mapeia),
  auto_import boolean default true

transactions  (ALTER)
  + provider text
  + external_id text
  + connection_id uuid
  UNIQUE (provider, external_id) WHERE provider IS NOT NULL
```

RLS: dono vê PF; membros da company veem PJ (mesmo padrão de `accounts`).
GRANT SELECT/INSERT/UPDATE/DELETE para `authenticated`, ALL para `service_role`.

RPC `pluggy_link_provider_account(_conn_account_id, _account_id)` — mapeia conta descoberta a uma conta existente com validação de contexto/empresa.

## 2. Edge Functions

| Function | verify_jwt | Papel |
|---|---|---|
| `pluggy-connect-token` | true | Gera `connect_token` p/ o widget do usuário logado. |
| `pluggy-list-institutions` | true | Proxy opcional pra buscar bancos (cache). |
| `pluggy-create-connection` | true | Recebe `itemId` do widget, cria `bank_connections` + `bank_connection_accounts` puxando `/accounts`. |
| `pluggy-sync-item` | true | Sync manual on-demand de uma conexão. |
| `pluggy-sync-all` | false | Chamado pelo pg_cron diário; percorre todas conexões ativas. |
| `pluggy-webhook` | false | Recebe `item/updated`, `transactions/created`, `item/error`; valida HMAC; dispara sync. |
| `pluggy-delete-connection` | true | Remove item no Pluggy + soft-delete local. |

**Lógica de sync** (compartilhada):
- Buscar `/transactions?itemId=X&from=<last_sync_at-3d>` (janela retroativa p/ pegar atualizações).
- Para cada conta com `account_id` mapeado e `auto_import=true`:
  - `upsert` em `transactions` por `(provider, external_id)`.
  - Preencher: `description`, `amount` (abs), `transaction_type` (receita se positivo, despesa se negativo), `transaction_date`, `payment_date`, `status='confirmado'`, `is_confirmed=true`, `account_id`, `user_id`, `context`, `company_id`, `connection_id`, `provider='pluggy'`.
  - Aplicar `import_rules` existente para auto-categorizar.
- Atualizar `last_sync_at`; se erro → `status='login_error'` + `last_error`.
- Trigger `sync_account_balance_on_tx` já existente cuida do saldo.

## 3. Cron diário

Via `supabase--insert` (não migration, pois contém URL/key):
```sql
select cron.schedule('pluggy-daily-sync','0 6 * * *',
  $$ select net.http_post(
    url:='https://<ref>.supabase.co/functions/v1/pluggy-sync-all',
    headers:='{"Content-Type":"application/json","apikey":"<anon>"}'::jsonb,
    body:='{}'::jsonb) $$);
```

## 4. Frontend

**Nova aba em `ContasBancarias.tsx`: "Conexões Automáticas"**

- Botão **"Conectar banco"** → chama `pluggy-connect-token` → abre `PluggyConnect` (`react-pluggy-connect`) com o token.
  - `onSuccess({itemId})` → `pluggy-create-connection` → abre modal de **mapeamento**.
- **Modal de mapeamento** (`MapDiscoveredAccountsDialog`): lista contas descobertas; para cada uma, `Select` das `accounts` compatíveis (mesmo contexto/empresa) + botão "Criar nova conta a partir desta".
- **Card por conexão** (`BankConnectionCard`): logo instituição, nome, contas mapeadas, status (badge colorido), `last_sync_at` relativo, ações: **Sincronizar agora**, **Reconectar** (quando `login_error` ou `consent_expired`), **Desconectar**.
- Alerta global quando `consent_expires_at < now + 30d` → CTA renovar.
- Em `Lancamentos.tsx`: badge 🔗 "Importado do banco" para linhas com `provider='pluggy'`; bloquear edição de `amount`/`transaction_date` (permitir só categoria/notas).

## 5. Segurança
- `pluggy-webhook`: validar header `x-pluggy-signature` (HMAC SHA256 com `PLUGGY_WEBHOOK_SECRET`).
- Toda função autenticada usa `getClaims()` antes de qualquer operação.
- Requests Pluggy usam SDK oficial `pluggy-sdk` (npm) via `npm:` specifier no Deno.
- RLS impede que usuário veja conexões de outros; `bank_connection_accounts` herda via `connection_id`.

## 6. Rollout
1. Migration + RPCs.
2. Edge functions (começar por `connect-token`, `create-connection`, `sync-item`).
3. UI: aba conexões + widget + mapeamento.
4. Webhook + cron.
5. Renovação de consentimento (12 meses).
6. QA em sandbox Pluggy → produção.

## Estimativa
~2 sprints. Fase 1 (conectar+sync manual) já entrega valor em ~4-5 dias.

## Detalhes técnicos (para o dev)
- Pluggy SDK: `import { PluggyClient } from "npm:pluggy-sdk"`.
- Widget npm: `bun add react-pluggy-connect`.
- `context`/`company_id` do `bank_connection` vem do `useCompanyContext` no momento de conectar.
- Dedupe: `ON CONFLICT (provider, external_id) DO UPDATE SET status, amount_paid, payment_date` apenas se `updated_at do provider > transactions.updated_at`.
- Categorização: reusar helper de `import_rules` já usado em `ImportStatementDialog`.
