# Remover Open Finance / Pluggy

Confirmações recebidas: manter lançamentos já importados (nenhum existe) e remover os 3 secrets da Pluggy.

## Frontend
- Deletar `src/pages/admin/OpenFinance.tsx`, `src/hooks/usePluggy.ts`, `src/components/accounts/usePluggyConnect.ts`, `src/components/accounts/OpenFinanceSection.tsx`
- `src/App.tsx`: remover `AdminOpenFinance` lazy import e rota `/admin/open-finance`
- `src/components/layout/AdminSidebar.tsx`: remover item "Open Finance" e import de `Plug`
- `src/pages/ContasBancarias.tsx`: remover import e uso de `<OpenFinanceSection>`

## Edge Functions
- Deletar diretórios: `supabase/functions/pluggy-connect-token`, `pluggy-register-item`, `pluggy-sync-connection`, `pluggy-delete-connection`, `pluggy-webhook`
- Deletar `supabase/functions/_shared/pluggy.ts`
- `supabase/config.toml`: remover bloco `[functions.pluggy-webhook]`
- Chamar `supabase--delete_edge_functions` para as 5 funções

## Banco (migration)
Confirmado no banco: `transactions.provider` tem 0 linhas → seguro dropar colunas.
```sql
DROP FUNCTION IF EXISTS public.pluggy_link_provider_account CASCADE;
DROP FUNCTION IF EXISTS public.pluggy_upsert_transaction CASCADE;
DROP FUNCTION IF EXISTS public.can_sync_bank_connection CASCADE;
DROP FUNCTION IF EXISTS public.can_manage_bank_connection CASCADE;
DROP FUNCTION IF EXISTS public.list_active_bank_connections CASCADE;
DROP TABLE IF EXISTS public.bank_connection_accounts CASCADE;
DROP TABLE IF EXISTS public.bank_connections CASCADE;
DROP TABLE IF EXISTS public.pluggy_webhook_events CASCADE;
ALTER TABLE public.transactions DROP COLUMN IF EXISTS provider;
ALTER TABLE public.transactions DROP COLUMN IF EXISTS provider_transaction_id;
```

## Secrets
Remover `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`, `PLUGGY_WEBHOOK_TOKEN` via `secrets--delete_secret`.
