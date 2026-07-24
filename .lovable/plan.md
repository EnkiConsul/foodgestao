## Objetivo

Reposicionar Open Finance para dentro do cadastro de **contas bancárias** e **cartões de crédito**, adotando o modelo híbrido usado por Nubank PJ, Conta Azul e QuickBooks. A `/open-finance` fica como Central de Conexões em Configurações; a ação diária de conectar/desconectar acontece no card da conta ou cartão.

## Decisões confirmadas
1. Cartões de crédito seguem o mesmo padrão (botão dentro do cadastro).
2. Renovação de consentimento: aviso visual no card **e** e-mail 7 dias antes.
3. Contas OF já existentes (Santander) serão auto-vinculadas retroativamente após deploy.

## Fase 1 — Schema

Migração adicionando campos opcionais em `public.accounts`:

| Campo | Tipo |
|---|---|
| `agency` | `text` nullable |
| `account_number` | `text` nullable |
| `document_last4` | `text` nullable — últimos 4 do CPF/CNPJ do titular |

Nenhuma alteração em `credit_cards` (já tem `last4`, `brand`, `issuer`).

## Fase 2 — Auto-criação no `pluggy-item-register`

Em `supabase/functions/pluggy-item-register/index.ts`, após o upsert em `open_finance_accounts`:

**Para `provider_type = BANK` com `local_account_id` NULL:**
- Criar `public.accounts` com:
  - `user_id` = `connected_by_user_id`; `company_id` = da conexão; `context` = `pj` se company_id, senão `pf`
  - `name` = `"{institution_name} — {provider_name}"` truncado a 60 chars
  - `account_type` mapeado (`CHECKING_ACCOUNT→conta_corrente`, `SAVINGS_ACCOUNT→poupanca`, resto → `conta_corrente`)
  - `initial_balance` = `current_balance` = `provider_balance ?? 0`
  - `bank_slug` = slugify(`institution_name`); `color` = `institution_primary_color`
  - `agency`, `account_number` extraídos de `bankData.transferNumber` (`"agency-account"`) se disponível
- Atualizar `open_finance_accounts`: `local_account_id`, `auto_import=true`, `ownership_status='linked_auto'`

**Para `provider_type = CREDIT` com `local_credit_card_id` NULL:**
- Criar `public.credit_cards` com:
  - `user_id`, `company_id`, `context` idem
  - `brand` = `card_brand ?? 'other'`; `last4` = últimos 4 de `provider_number_masked`
  - `holder_name` = `provider_name`; `issuer` = `institution_name`
  - `credit_limit` = `creditData.creditLimit ?? 0`
  - `closing_day` = dia de `balance_close_date` ou `1`; `due_day` = dia de `balance_due_date` ou `10`
  - `is_corporate` = `context === 'pj'`
- Atualizar `open_finance_accounts`: `local_credit_card_id`, `auto_import=true`

Idempotente (só cria se local_id for NULL). Try/catch por conta — falhas isoladas não abortam o registro.

## Fase 3 — Backend de expiração de consentimento

**Cron `pg_cron` diário** (nova função `notify-consent-expiring`):
- Busca `open_finance_connections` com `consent_expires_at` entre hoje+7d e hoje+8d que ainda não notificadas.
- Marca `consent_notified_at` (nova coluna) e chama Edge Function `send-consent-expiry-email`.
- E-mail templatizado em 360°FOOD com CTA para renovar.

## Fase 4 — UI: Contas Bancárias

**`src/pages/ContasBancarias.tsx`:**
- Botão "Nova conta" abre `NovaContaWizard` com 2 opções: manual · Open Finance.
- Cada card exibe novo componente `OpenFinanceStatusBadge`:

| Estado | Badge | Ação inline |
|---|---|---|
| Sem integração | cinza "Manual" | "⚡ Conectar Open Finance" |
| Ativo | 🟢 "Open Finance · {banco}" · "Sincronizado há X" | "Sincronizar" · "Desvincular" |
| Consentimento <7d | 🟡 "Renove até {data}" | "Renovar acesso" |
| Precisa reconectar | 🔴 "Reconectar" | "Reconectar" |

**`AccountForm.tsx`:** campos opcionais `agency`, `account_number`, `document_last4` com máscaras Zod (BR).

**Novo `src/components/accounts/OpenFinanceStatusBadge.tsx`:** consome `useOpenFinanceStatusForAccount(accountId)` (query `open_finance_accounts + connection` por `local_account_id`).

**Novo `NovaContaWizard.tsx`:** decisão inicial manual/OF; para OF, dispara `PluggyConnectLauncher` com callback que redireciona para a conta criada.

## Fase 5 — UI: Cartões de Crédito

Mesmo padrão em `src/pages/CartoesCredito.tsx` (ou equivalente) e `CreditCardForm.tsx`. `OpenFinanceStatusBadge` reusável (parâmetro `entityType: 'bank' | 'card'`).

## Fase 6 — Reposicionamento de menu

- **Remover** item "Open Finance" de `src/components/layout/FinanceiroMenu.tsx`.
- **Adicionar** em Configurações → Integrações: item "Open Finance" apontando para `/open-finance` (rota preservada).
- Renomear página `OpenFinance.tsx` para "Central de Conexões" — foco em saúde/expiração/reconexão, não em conectar novos bancos.

## Fase 7 — Retroativo automático

Após deploy, `insert` sob aprovação:
1. Para cada `open_finance_accounts` com `local_account_id IS NULL AND provider_type='BANK'` (hoje: Santander): criar `accounts` local via mesma lógica da Fase 2 e linkar.
2. Idem para `provider_type='CREDIT'`.
3. Após vincular, disparar `pluggy-sync` uma vez por conexão para trazer 365 dias.

## Fase 8 — Validação

- Consultas confirmam `local_account_id` preenchido em todas as contas OF.
- `open_finance_sync_runs` com `transactions_created > 0` para Santander.
- Transações aparecendo em `/lancamentos`.
- Card na página `/contas-bancarias` mostra badge verde "Open Finance · Santander".

## Arquivos afetados

| Arquivo | Ação |
|---|---|
| Migração | `+3 colunas em accounts`, `+consent_notified_at em open_finance_connections`, cron pg_cron |
| `supabase/functions/pluggy-item-register/index.ts` | Auto-criação de conta/cartão local |
| `supabase/functions/notify-consent-expiring/index.ts` | Nova |
| `supabase/functions/send-consent-expiry-email/index.ts` | Nova (Resend) |
| `src/pages/ContasBancarias.tsx` | Wizard + badge OF |
| `src/pages/CartoesCredito.tsx` | Badge OF |
| `src/components/accounts/AccountForm.tsx` | Agência/conta/documento |
| `src/components/accounts/OpenFinanceStatusBadge.tsx` | Novo |
| `src/components/accounts/NovaContaWizard.tsx` | Novo |
| `src/hooks/useOpenFinanceStatusForAccount.ts` | Novo |
| `src/pages/OpenFinance.tsx` | Renomear título/subtítulo → "Central de Conexões" |
| `src/components/layout/FinanceiroMenu.tsx` | Remover item OF |
| `src/pages/Configuracoes.tsx` (ou sidebar) | Adicionar item "Open Finance" |
| `src/lib/validations.ts` | Zod para agência/conta |

Nenhuma quebra de rota — `/open-finance` continua funcionando.
