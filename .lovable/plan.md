# Integração Pluggy — Open Finance com Conciliação Manual

Reconstrução limpa da integração seguindo a documentação oficial da Pluggy (Connect Widget + API + Webhooks), focada em: **conectar → puxar últimos 30 dias → conciliar → confirmar como lançamentos**.

## Escopo

- **Somente PJ**: disponível apenas no contexto empresa (`context = 'pj'`).
- **Sincronização inicial**: últimos 30 dias corridos a partir da conexão.
- **Sincronização contínua**: webhook + cron diário reaproveitando o mesmo pipeline.
- **Nada entra em `transactions` sem passar pela tela de conciliação.**

## Arquitetura

```text
[Usuário] → Connect Widget (Pluggy JS) → item conectado
                                          │
                                          ▼
                          [Webhook] pluggy-webhook  ──┐
                                                      ▼
                                            [Edge] pluggy-sync-item
                                                      │  (chama Pluggy REST, últimos 30d)
                                                      ▼
                                        pluggy_accounts / pluggy_staging_transactions
                                                      │
                                                      ▼
                                       Página /contas-bancarias/conciliacao
                                          (revisar, categorizar, confirmar)
                                                      │
                                                      ▼
                                            public.transactions
```

## Banco de dados (migração)

Novas tabelas (todas com RLS por `company_id` + GRANTs para `authenticated` e `service_role`):

- `pluggy_connections`: uma linha por item Pluggy conectado. Colunas: `id`, `company_id`, `pluggy_item_id`, `connector_id`, `connector_name`, `connector_image_url`, `status` (`created|updating|updated|login_error|outdated|error`), `execution_status`, `last_synced_at`, `last_error`, `created_by`, timestamps.
- `pluggy_accounts`: contas retornadas pelo item. Colunas: `id`, `connection_id`, `pluggy_account_id`, `type` (bank/credit), `subtype`, `name`, `number_masked`, `balance`, `currency_code`, `linked_account_id` (FK opcional para `accounts` — preenchida na conciliação inicial), timestamps.
- `pluggy_staging_transactions`: lançamentos brutos aguardando conciliação. Colunas: `id`, `company_id`, `connection_id`, `pluggy_account_id`, `pluggy_transaction_id UNIQUE`, `date`, `description`, `amount`, `currency_code`, `category_pluggy`, `type` (`DEBIT|CREDIT`), `raw JSONB`, `status` (`pending|confirmed|ignored|duplicate`), `matched_transaction_id` (quando conciliado), `suggested_category_id`, `suggested_account_id`, timestamps.
- `pluggy_webhook_events`: log de webhooks recebidos (idempotência por `event_id`).

Índices em `(company_id, status)`, `(connection_id, date DESC)`, `pluggy_transaction_id`.

## Edge Functions

Todas com CORS + `getClaims`, exceto o webhook que valida por secret compartilhado.

1. **`pluggy-connect-token`** (POST) — troca credenciais server-side por um `connect_token` de curta duração (documentação Pluggy: *Authentication → Create Connect Token*). Aceita `item_id` opcional para reconexão. Retorna `{ accessToken, expiresAt }`.
2. **`pluggy-sync-item`** (POST) — dado um `item_id`, chama `GET /items/:id`, `GET /accounts?itemId=`, e `GET /transactions?accountId=&from=<hoje-30>&to=<hoje>` paginado. Faz upsert em `pluggy_connections`, `pluggy_accounts` e `pluggy_staging_transactions` com `status='pending'`. Idempotente.
3. **`pluggy-webhook`** (POST, público) — recebe eventos (`item/created`, `item/updated`, `item/error`, `transactions/created|updated`). Valida via header `X-Pluggy-Signature` contra `PLUGGY_WEBHOOK_SECRET`. Registra em `pluggy_webhook_events` e enfileira sync via `pluggy-sync-item`.
4. **`pluggy-disconnect-item`** (POST) — chama `DELETE /items/:id` na Pluggy e marca conexão local como removida (mantém staging histórico? Não — apaga staging pending e mantém confirmados).
5. **`pluggy-cron-sync`** (cron diário 06:00) — itera conexões ativas e dispara `pluggy-sync-item`.

Secrets necessários (via `add_secret`): `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`, `PLUGGY_WEBHOOK_SECRET`.

## Frontend

### 1. Cadastro de conta via Open Finance
- Reintroduzir `AccountCreationMethodDialog` (Manual vs Open Finance) apenas no contexto PJ em `ContasBancarias.tsx`.
- Novo componente `PluggyConnectDialog.tsx`:
  - Chama `pluggy-connect-token` → carrega script `https://cdn.pluggy.ai/pluggy-connect/v2.9.0/pluggy-connect.js` → instancia `PluggyConnect({ connectToken, onSuccess, onError })`.
  - Em `onSuccess({ item })`: chama `pluggy-sync-item`, mostra toast "Sincronizando últimos 30 dias" e redireciona para `/contas-bancarias/conciliacao`.

### 2. Página de conciliação — `/contas-bancarias/conciliacao`
Nova rota + página `ConciliacaoPluggy.tsx`. Layout inspirado no padrão de listagens existente (filtros no topo, tabela abaixo, ações inline).

**Header:**
- Seletor de conexão (badge com status/última sync + botão "Sincronizar agora").
- Filtros: período (padrão últimos 30 dias), tipo (entrada/saída), status (pendentes/ignorados/confirmados), busca por descrição.
- Contadores: X pendentes · Y confirmados · Z ignorados.

**Tabela (colunas):**
| Data | Descrição | Valor | Tipo | Conta destino | Categoria | Ações |
- **Conta destino**: `Select` com contas bancárias do contexto PJ. Sugerido = `pluggy_accounts.linked_account_id`. Se a conta ainda não existe, botão inline "Criar conta a partir desta" (pré-preenche `AccountFormDialog` com nome/banco/tipo do `pluggy_accounts`).
- **Categoria**: usa `Combobox` de categorias com sugestão automática via motor de regras existente (`categorize_transaction` RPC).
- **Ações**: ✓ Confirmar · ✕ Ignorar · ↔ Marcar duplicado.
- Seleção múltipla com bulk "Confirmar selecionados" / "Ignorar selecionados".

**Fluxo de confirmação:**
- Chama RPC nova `pluggy_confirm_staging(staging_ids uuid[], target_account_id, category_id)` que:
  - Insere em `transactions` (status `confirmado`, `payment_date = staging.date`, `type` derivado do sinal do valor).
  - Marca staging como `confirmed` + `matched_transaction_id`.
  - Reaplica motor de saldos (já existente).
- Detecção de duplicado: query em `transactions` por `company_id + account_id + date + amount` antes de confirmar → destaca linha em amarelo com badge "Possível duplicado".

### 3. Painel de conexões — `/contas-bancarias/conexoes`
Lista `pluggy_connections` da empresa com: banco, status, última sync, contas vinculadas, pendentes de conciliação, botão "Sincronizar", "Reconectar" (login_error), "Desconectar".

### 4. Widget de pendências
Adicionar em `useDpPendencias`/dashboard-home entrada "Lançamentos aguardando conciliação" quando `pluggy_staging_transactions.status='pending'` > 0.

## Rotas e Sidebar

- `App.tsx`: adicionar `/contas-bancarias/conexoes` e `/contas-bancarias/conciliacao` (lazy).
- `AdminSidebar.tsx`: não é necessário — é feature de usuário, não admin. Entrada aparece dentro da página Contas Bancárias.

## Segurança

- RLS: `company_id IN (select company_id from company_members where user_id = auth.uid())` em todas as tabelas novas.
- Edge Functions com JWT obrigatório exceto webhook (secret compartilhado + validação de assinatura).
- `PLUGGY_CLIENT_SECRET` nunca vai ao frontend — só via `pluggy-connect-token`.

## Ordem de implementação

1. Migração (tabelas + RLS + GRANTs + RPC `pluggy_confirm_staging`).
2. Solicitar secrets Pluggy via `add_secret` (client id, secret, webhook secret).
3. Edge Functions (`connect-token`, `sync-item`, `webhook`, `disconnect-item`, `cron-sync`).
4. Frontend — `PluggyConnectDialog` + reintrodução do `AccountCreationMethodDialog`.
5. Página `/contas-bancarias/conciliacao`.
6. Página `/contas-bancarias/conexoes` + widget de pendências.
7. Configurar webhook URL na Pluggy e agendar cron.

## Fora de escopo (agora)

- Histórico maior que 30 dias (pode ser adicionado depois via botão "Buscar mais").
- MFA em tempo real (delegado ao próprio Connect Widget da Pluggy).
- Categorização automática 100% — sugestões apenas; confirmação é manual por design.
