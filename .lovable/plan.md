## Objetivo
Remover toda a implementação e integração da Pluggy (V1 e V2) do 360°FOOD sem afetar contas manuais, lançamentos, cartões, DP, dashboards e demais funcionalidades.

## Frontend
- Remover páginas: `ConexoesOpenFinance.tsx`, `ConciliacaoOpenFinance.tsx`, `admin/PluggyV2Conexoes.tsx`, `admin/PluggyV2WebhookLogs.tsx`, `admin/PluggyV2Reconciliacao.tsx`, `admin/PluggyV2Alertas.tsx`.
- Remover componentes: `OpenFinanceWizard.tsx`, `OpenFinanceHealthPanel.tsx`.
- Simplificar `AccountCreationMethodDialog.tsx` para ir direto ao cadastro manual (ou remover o diálogo e abrir o `AccountFormDialog` diretamente em `ContasBancarias.tsx` e `TransactionFormDialog.tsx`).
- `App.tsx`: remover rotas `/contas-bancarias/conexoes`, `/contas-bancarias/conciliacao` e `/admin/pluggy-v2-*`.
- `AdminSidebar.tsx`: remover 4 itens Pluggy V2.
- `ContasBancarias.tsx`: remover botão "Conexões Open Finance", auto-open via `?openFinance=1`, wizard e mensagem de erro específica de Open Finance na exclusão.
- `useRealtimeSync.tsx`: retirar `open_finance_*` da união de tabelas.
- Remover chamadas restantes (`page.tsx` que consultam `open_finance_*` ou `pluggy_v2_*`).

## Backend (Edge Functions)
Deletar via `delete_edge_functions`:
`pluggy-connect-token`, `pluggy-consent-notifier`, `pluggy-item-delete`, `pluggy-item-materialize`, `pluggy-item-register`, `pluggy-items-purge-orphans`, `pluggy-remote-delete-worker`, `pluggy-sync`, `pluggy-webhook`, `pluggy-webhook-configure`, `pluggy-webhook-drain`, `pluggy-worker`, `pluggy-v2-alerts`, `pluggy-v2-connect-token`, `pluggy-v2-webhook`, `pluggy-v2-worker`.

Também remover as pastas correspondentes em `supabase/functions/` e a função global `pluggy-webhook-global` se existir.

## Banco de dados (migração)
- DROP das tabelas em ordem segura (com CASCADE onde há FKs internas ao próprio conjunto):
  - `open_finance_transactions_raw`, `open_finance_webhook_events`, `open_finance_sync_runs`, `open_finance_connection_requests`, `open_finance_accounts`, `open_finance_connections`.
  - `pluggy_v2_transactions_raw`, `pluggy_v2_webhook_events`, `pluggy_v2_sync_runs`, `pluggy_v2_alerts`, `pluggy_v2_accounts`, `pluggy_v2_connect_requests`, `pluggy_v2_connections`.
- DROP das funções específicas: `classify_open_finance_item_state`, `create_and_link_open_finance_account`, `cleanup_open_finance_artifacts`, `disconnect_open_finance_connection`, `auto_promote_open_finance_raw`, `claim_open_finance_sync`, `enqueue_open_finance_scheduled_syncs`, `get_company_pluggy_version`, `set_company_pluggy_version`, `pluggy_webhook_claim` e afins.
- Colunas em `companies`: remover `pluggy_version` (e outras colunas específicas Pluggy, se existirem).
- Remover jobs `pg_cron` relacionados (`pluggy_v2_*`, `open_finance_*`).
- Remover triggers em `accounts` que referenciam vínculos Pluggy, se houver.

## Segredos
Após remoção, listar/deletar segredos: `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`, `PLUGGY_WEBHOOK_SECRET`, `PLUGGY_CRON_TICK_SECRET`, `PLUGGY_V1_FROZEN`, `PLUGGY_BASE_URL` e correlatos.

## Preservado (não será tocado)
- Tabelas `accounts`, `transactions`, `credit_cards`, `credit_card_invoices`, `transaction_attachments`, `banks`.
- Fluxo manual completo de contas/lançamentos e motor de saldos (`adjust_account_balance`, triggers de saldo, `soft_delete_account`, `delete_account`).
- Todos os módulos DP, dashboards, relatórios, categorização por IA (não depende de Pluggy).

## Riscos e mitigação
- Contas hoje marcadas como Open Finance permanecerão como contas manuais comuns (nenhuma sync automática). Não haverá perda de saldos ou lançamentos já materializados em `accounts`/`transactions`.
- Após aprovar, executarei em ordem: migração → deleção de edge functions → limpeza de código → build → verificação de tipos.

Pode aprovar para eu executar?
