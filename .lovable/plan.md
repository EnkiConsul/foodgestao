
# Reintegrar Pluggy Open Finance

O backend original ainda tem as tabelas `bank_connections`, `bank_connection_accounts` e a RPC `pluggy_link_provider_account`. O que precisamos reconstruir é: as edge functions da Pluggy, o widget de conexão no frontend e a sincronização automática de transações.

## 1. Credenciais e configuração

- Solicitar via `add_secret` dois secrets no Lovable Cloud:
  - `PLUGGY_CLIENT_ID`
  - `PLUGGY_CLIENT_SECRET`
- Documento base: `https://docs.pluggy.ai/`. Fluxo usado:
  1. Backend obtém `apiKey` em `POST /auth`
  2. Backend cria `connectToken` em `POST /connect_token`
  3. Frontend abre o widget Pluggy Connect com esse token
  4. Widget retorna um `itemId` (institution) → backend salva em `bank_connections`
  5. Backend lista `/accounts?itemId=...` → popula `bank_connection_accounts`
  6. Backend lista `/transactions?accountId=...` → grava em `transactions`
  7. Webhook `POST /pluggy-webhook` avisa mudanças (`item/updated`, `transactions/created`)

## 2. Ajustes no banco (migration)

Pequenos complementos ao schema existente:
- Adicionar em `bank_connection_accounts` a coluna `last_synced_at timestamptz` e `last_synced_tx_date date` (ponto de retomada da sincronização).
- Adicionar em `transactions` a coluna `provider_transaction_id text` com índice único parcial `(account_id, provider_transaction_id) WHERE provider_transaction_id IS NOT NULL` para idempotência da importação.
- Nova tabela `pluggy_webhook_events` (id, event_type, item_id, payload jsonb, received_at, processed_at, error) — com GRANTs, RLS restrita ao `service_role` e leitura para super_admin.
- Nova RPC `pluggy_upsert_transaction(...)` (SECURITY DEFINER) que insere/atualiza um lançamento pela chave `(account_id, provider_transaction_id)` respeitando a conta vinculada e o contexto PF/PJ, marcando `status = 'confirmado'` para auto-import.

## 3. Edge functions (novas, em `supabase/functions/`)

Todas usam `PLUGGY_CLIENT_ID` / `PLUGGY_CLIENT_SECRET`, encapsulam o cliente Pluggy em `_shared/pluggy.ts` (com cache do `apiKey` por ~2h) e exigem JWT — exceto o webhook.

- `pluggy-connect-token`: cria connectToken para o usuário logado; aceita `itemId` opcional para updates de credenciais.
- `pluggy-register-item`: recebe `{ itemId, context, companyId }` do widget, chama `/items/{id}` + `/accounts?itemId=`, faz upsert em `bank_connections` e `bank_connection_accounts` (checando membership da empresa).
- `pluggy-sync-connection`: dispara sincronização manual/agendada — para cada `bank_connection_account` com `account_id` vinculada e `auto_import=true`, busca `/transactions` a partir de `last_synced_tx_date` e insere via `pluggy_upsert_transaction`. Atualiza saldo do provedor.
- `pluggy-delete-connection`: chama `DELETE /items/{itemId}` na Pluggy e remove `bank_connections` (cascade nas contas do provedor); mantém as contas internas (só desvincula).
- `pluggy-webhook`: `verify_jwt = false` em `config.toml`; valida assinatura opcional, persiste em `pluggy_webhook_events`, e para eventos relevantes chama internamente `pluggy-sync-connection` do item afetado.

## 4. Frontend — dentro de Contas Bancárias

Reaproveita a página `src/pages/ContasBancarias.tsx`:

- Novo componente `src/components/accounts/OpenFinanceSection.tsx` renderizado acima da lista existente com:
  - Botão primário **"Conectar via Open Finance"**.
  - Lista de `bank_connections` do contexto ativo (PF ou empresa selecionada), com logo/nome da instituição, status (`active`, `updating`, `outdated`, `login_error`), última sincronização e ações: **Sincronizar agora**, **Atualizar credenciais**, **Desconectar**.
  - Para cada conexão, tabela expansível das `bank_connection_accounts` com toggle `auto_import` e um select para vincular a uma `accounts` interna existente (usa RPC `pluggy_link_provider_account`). Contas ainda não vinculadas mostram o CTA **"Criar nova conta bancária a partir desta"** que abre o `AccountFormDialog` pré-preenchido.
- Novo hook `src/hooks/usePluggy.ts` com Tanstack Query para listar conexões/contas provedor e mutations para conectar/sincronizar/desconectar. Usa `useRealtimeSync` nas tabelas `bank_connections`, `bank_connection_accounts` e `transactions` para atualização em tempo real.
- Componente `PluggyConnectWidget` que carrega dinamicamente o script oficial `https://cdn.pluggy.ai/pluggy-connect/v2.9.0/pluggy-connect.js`, chama a edge function `pluggy-connect-token` e abre o `PluggyConnect` com `onSuccess → pluggy-register-item` + toast de sucesso, `onError` com mensagens amigáveis.
- Cada conta interna já vinculada ganha um badge "Open Finance" e ícone da instituição na listagem atual (`ContasBancarias.tsx`).

## 5. Auto-importação e saldo

- Como escolhido, `auto_import` começa `true` por padrão. A RPC insere as transações com `status = 'confirmado'`, o que dispara os triggers já existentes (`sync_account_balance_on_tx`) — saldo atualiza sozinho e o alerta "Saldos podem estar desatualizados" fica compatível.
- Regra de deduplicação por `provider_transaction_id`; transações removidas na Pluggy não são apagadas (apenas logadas), evitando divergência histórica.

## 6. Segurança

- Todas as edge functions validam o JWT do usuário e checam `has_role`/membership antes de tocar em conexões PJ.
- Nenhum campo com Client ID/Secret da Pluggy é exposto ao frontend; o widget recebe apenas o `connectToken` de curta duração.
- RLS existente de `bank_connections` já cobre acesso por dono/company_member; a nova coluna e as ações reutilizam essas policies.

## 7. Ordem de execução na build

1. Solicitar secrets `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET`.
2. Rodar a migration (colunas novas + tabela `pluggy_webhook_events` + RPC de upsert).
3. Criar `_shared/pluggy.ts` e as 5 edge functions.
4. Ajustar `supabase/config.toml` adicionando `[functions.pluggy-webhook] verify_jwt = false`.
5. Criar hook, widget e `OpenFinanceSection`; ligar em `ContasBancarias.tsx`.
6. Testes manuais no ambiente sandbox/produção: conectar Itaú/Nubank de teste, vincular conta, forçar sync, checar saldo e webhook.

## Fora do escopo desta entrega

- Regras de categorização automática (usaremos o motor de regras já existente em `import_rules` posteriormente).
- Reconciliação retroativa de meses anteriores ao consentimento.
- Suporte a investimentos/cartão como sub-produtos separados (todas as contas caem como `accounts` no formato atual).
