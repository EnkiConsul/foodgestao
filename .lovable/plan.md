# Finalização da base de dados Open Finance

## Diagnóstico (auditoria)

Já existe:
- Tabelas `open_finance_connections`, `open_finance_accounts`, `open_finance_connection_requests`, `open_finance_sync_runs`, `open_finance_transactions_raw`, `open_finance_webhook_events` com índices, uniques (`company_id+import_hash`, `connection_id+pluggy_account_id`) e RLS.
- RPCs `create_and_link_open_finance_account`, `link_open_finance_account`, `claim_open_finance_sync`, `release_open_finance_sync`.
- Edge functions `pluggy-connect-token`, `pluggy-item-register`, `pluggy-sync`, `pluggy-webhook`, `pluggy-consent-notifier`.

Faltam no DB para fechar Blocos 5, 7 (leitura), 8, 9:
- Não há RPCs para **ignorar / desvincular / (des)ativar importação / desconectar / promover raw→transactions / ajustar saldo / soft delete**.
- `open_finance_transactions_raw` e `open_finance_sync_runs` estão *deny-all* para o cliente — a Central de Conciliação e os cards de conta precisam leitura por membros da empresa.
- `accounts` não tem **data de referência do saldo**, **soft_deleted_at**, nem *guard* que impeça editar `current_balance` de conta conectada nem *hard delete* de conta com histórico.

Esta fase entrega **apenas a base de dados**. Nada de UI/edge nova (permanecem para Blocos 6/7 front e Bloco 8/9 de UX).

## Mudanças no schema

Colunas em `public.accounts`:
- `reference_balance_date date` — data de referência do saldo inicial (fluxo manual, Bloco 6).
- `soft_deleted_at timestamptz` — soft delete (Bloco 9).

Índice: `idx_accounts_soft_deleted` parcial (`WHERE soft_deleted_at IS NOT NULL`).

Índice em `open_finance_transactions_raw`: `idx_of_raw_of_account_unprocessed (of_account_id) WHERE processed_at IS NULL` para o promotor.

## Triggers de proteção em `accounts`

- `guard_of_current_balance` (BEFORE UPDATE): se `EXISTS (open_finance_accounts WHERE local_account_id = NEW.id)` e `NEW.current_balance <> OLD.current_balance`, rejeita com mensagem instruindo uso de `adjust_account_balance`.
- `prevent_hard_delete_account_with_history` (BEFORE DELETE): se existirem `transactions`, `open_finance_accounts` vinculadas ou `credit_card_invoices` referenciando a conta, bloqueia e sugere `soft_delete_account`.

## Novos RPCs (todos `SECURITY DEFINER`, `search_path = public`, gate `is_company_admin_or_owner`, com `insert_audit_log`)

- `set_open_finance_auto_import(_of_account_id uuid, _enabled boolean) RETURNS void`.
- `ignore_open_finance_account(_of_account_id uuid, _ignored boolean default true) RETURNS void` — usa flag `ignored` já existente.
- `unlink_open_finance_account(_of_account_id uuid) RETURNS void` — zera `local_account_id`, desativa `auto_import`.
- `disconnect_open_finance_connection(_connection_id uuid) RETURNS void` — marca `status='disconnected'`, `disconnected_at=now()`, desativa `auto_import` em todas as OF accounts da conexão. Chamada à Pluggy `deleteItem` fica com a edge function existente (Bloco 4).
- `soft_delete_account(_account_id uuid) RETURNS void` — `is_active=false, soft_deleted_at=now()`; falha se a conta ainda tiver `open_finance_accounts.local_account_id` apontando para ela (usuário precisa desconectar antes).
- `adjust_account_balance(_account_id uuid, _target_balance numeric, _adjust_date date, _note text) RETURNS uuid` — calcula delta contra `current_balance`, cria uma `transactions` de tipo `receita`/`despesa` com `status='confirmado'`, `description = 'Ajuste de saldo — <note>'`, retornando o id. Trigger financeiro existente atualiza o saldo; audit log registra `previous`, `target`, `delta`.
- `promote_open_finance_transactions(_connection_id uuid, _max_rows int default 500) RETURNS jsonb` — para raw não processados de OF accounts com `local_account_id IS NOT NULL AND auto_import=true AND ignored=false`, insere em `transactions` (mapeando `amount`, `date`, `description`, `direction`, `import_hash`) evitando duplicatas (`transactions.import_hash` já usado no importador manual), grava `raw.transaction_id` e `raw.processed_at`. Retorna `{inserted, duplicates, skipped_no_local, errors}`. Não substitui a Central de Conciliação (Bloco 7); serve para importação automática pós-sync.

## RLS complementar

- `open_finance_transactions_raw`: nova policy `of_raw_select_members` — SELECT para membros da company (`EXISTS company_members`). Mantém deny de INSERT/UPDATE/DELETE (worker usa service role).
- `open_finance_sync_runs`: nova policy `of_sync_runs_select_members` — SELECT para membros da company. INSERT/UPDATE seguem service role.

## GRANTs

- `GRANT EXECUTE ON FUNCTION public.<cada_novo_rpc> TO authenticated`.
- `GRANT SELECT ON public.open_finance_transactions_raw, public.open_finance_sync_runs TO authenticated` (RLS já filtra).

## Fora do escopo desta fase

- UI (Wizard OF, Central de Conciliação, cards de status).
- Edge functions novas (o `pluggy-sync` continua populando `raw`; a chamada ao `promote_open_finance_transactions` será feita ao final do sync numa próxima fase).
- Permissões nomeadas (`financeiro.*`) — permanece o gate `is_company_admin_or_owner`.
- Colunas denormalizadas de origem em `accounts` (origem/status são derivados via JOIN em `open_finance_accounts`).

## Entregáveis

- 1 migration única contendo: 2 colunas + 2 índices + 2 triggers + 7 RPCs + 2 policies + GRANTs.
- Nenhum arquivo TS alterado nesta fase.
- Teste manual sugerido após a migration:
  - Tentar `UPDATE accounts SET current_balance=... WHERE id=<of>` → deve falhar.
  - Rodar `SELECT public.adjust_account_balance(...)` → cria transação e atualiza saldo.
  - `SELECT public.promote_open_finance_transactions(<connection_id>)` após um sync → retorna contagens > 0 sem duplicar.

