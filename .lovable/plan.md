## Objetivo

No diálogo de **editar Conta Bancária** (`AccountFormDialog.tsx`), permitir alterar o **Saldo Atual** da conta, que hoje só é mostrado em modo de criação como "Saldo Inicial".

## Mudanças em `src/components/accounts/AccountFormDialog.tsx`

1. **Novo estado**: `currentBalance` (string formatada) preenchido no `useEffect` quando `account` carrega: `formatCurrency(String(Math.round(account.current_balance * 100)))`.

2. **UI em modo edição** (`isEdit === true`): exibir dois campos lado a lado (stack no mobile):
   - **Saldo Inicial** (`initialBalance`, já existe) — agora editável também em modo edição.
   - **Saldo Atual** (`currentBalance`) — novo campo `CurrencyInput`.
   - Texto de apoio curto abaixo: "O saldo atual normalmente é calculado pelos lançamentos. Altere apenas para ajustes manuais."

3. **Submit em modo edição**: incluir no `update` os campos `initial_balance: parseCurrencyToNumber(initialBalance)` e `current_balance: parseCurrencyToNumber(currentBalance)`.

4. **Audit log**: `account_updated` ganha `_details.balance_adjusted: true` quando o `current_balance` mudou em relação ao valor original, para rastrear ajustes manuais.

5. **Criação** (`!isEdit`) continua igual.

## Fora do escopo

- Não criar lançamento de ajuste automático (apenas grava o novo saldo).
- Não recalcular saldo a partir do histórico de transações.
- Sem mudanças de schema/RLS — colunas `initial_balance` e `current_balance` já existem em `accounts`.

## Resultado esperado

Ao editar uma conta bancária, os campos "Saldo Inicial" e "Saldo Atual" aparecem preenchidos e podem ser alterados; ao salvar, os valores são persistidos em `accounts.initial_balance` e `accounts.current_balance`.