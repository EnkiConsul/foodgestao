
## Objetivo

Remover toda a integração Open Finance (Pluggy) do projeto — código frontend, Edge Functions, tabelas, RPCs, templates, dependências e secrets — sem afetar contas bancárias manuais, cartões, lançamentos, layout, design nem quaisquer outros módulos.

Verifiquei que as tabelas `transactions`, `accounts` e `credit_cards` **não têm colunas `of_*`** — o isolamento é limpo, basta remover os artefatos dedicados.

## O que será removido

### 1. Frontend
- `src/pages/OpenFinance.tsx`
- `src/components/open-finance/` (pasta inteira: `PluggyConnectLauncher.tsx`, `AccountMappingDialog.tsx`, `PairingReviewSection.tsx`)
- `src/components/accounts/OpenFinanceBadge.tsx`
- `src/hooks/useOpenFinance.ts`
- `src/hooks/useAccountOpenFinanceStatus.ts`
- Rota `/open-finance` em `src/App.tsx` (import + `<Route>`)
- Item "Open Finance" em `src/components/layout/sidebar-menus/FinanceiroMenu.tsx`
- Em `src/components/accounts/AccountFormDialog.tsx`: remover o wizard "Manual vs Open Finance" e voltar direto ao formulário manual (mantendo todos os campos manuais atuais)
- Em `src/hooks/useRealtimeSync.tsx`: remover `open_finance_accounts` e `open_finance_connections` do tipo `RealtimeTable`
- Em `src/lib/edgeFunctionError.ts`: remover a entrada `pluggy_error`
- Em `package.json`: remover `react-pluggy-connect`

### 2. Edge Functions (delete + remover de `supabase/config.toml`)
- `pluggy-connect-token`
- `pluggy-item-register`
- `pluggy-item-delete`
- `pluggy-webhook`
- `pluggy-sync`
- `pluggy-worker`
- `pluggy-reconcile`
- `pluggy-consent-notifier`
- `supabase/functions/_shared/pluggy.ts`
- Template `pluggy-consent-expiring.tsx` e sua entrada em `_shared/transactional-email-templates/registry.ts`

### 3. Banco de dados (uma única migration)
Drop de tabelas (com `CASCADE` para políticas/índices/triggers):
- `open_finance_connection_requests`
- `open_finance_connections`
- `open_finance_accounts`
- `open_finance_consents`
- `open_finance_transactions_raw`
- `open_finance_webhook_events`
- `open_finance_sync_runs`

Drop de funções:
- `ingest_of_transaction(jsonb)`
- `auto_categorize_of_transaction()`
- `reconcile_of_transactions(uuid, integer)`
- `link_open_finance_account(uuid, uuid, uuid, boolean)`
- `claim_pluggy_webhook_events(integer, timestamptz)`
- `claim_open_finance_sync(...)` (se ainda existir)

Nenhuma coluna precisa ser removida de `transactions`/`accounts`/`credit_cards` (já confirmado que não existem).

### 4. Secrets (Lovable Cloud)
Após o deploy, listarei os secrets e removerei apenas os que forem exclusivos do Pluggy (ex.: `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`, `PLUGGY_WEBHOOK_SECRET`). Secrets compartilhados (Z-API, Turnstile, e-mail) ficam intactos.

## O que NÃO será tocado
- Design system, sidebar visual, tema, layouts.
- Contas bancárias manuais, cartões, lançamentos, faturas, categorias, orçamento, DP, IA, Asaas, e-mail, auth.
- Tipos regenerados do Supabase (`types.ts`) — o próprio processo pós-migration atualiza.

## Ordem de execução (build mode)
1. Migration única dropando tabelas + funções Open Finance.
2. Após migration executada e types regenerados: apagar arquivos frontend, editar `App.tsx`, `FinanceiroMenu.tsx`, `AccountFormDialog.tsx`, `useRealtimeSync.tsx`, `edgeFunctionError.ts`, `registry.ts`.
3. Remover Edge Functions e blocos correspondentes em `supabase/config.toml`; deploy das funções restantes.
4. `bun remove react-pluggy-connect`.
5. Rodar typecheck para garantir zero referências pendentes.
6. Auditar secrets e remover os exclusivos do Pluggy.

Resultado: sistema idêntico visualmente, cadastro de conta bancária volta a ser 100% manual, sem qualquer resíduo Pluggy.
