# Testes automatizados — Motor de Saldos Blindado

Cobrir com testes as três camadas da blindagem P0: RPC `adjust_account_balance`, guard `guard_of_current_balance`, e o novo componente `AdjustAccountBalanceDialog`. Seguir o padrão já usado em `ContasBancarias.delete.test.tsx` (Vitest) e `e2e/contas-bancarias-*.spec.py` (Playwright + RPCs de seed/cleanup).

## Escopo

### 1. Testes SQL (regressão + autorização)

Novas funções `SECURITY DEFINER` de teste no banco, no mesmo padrão de `_test_delete_account_authz`:

- `_test_adjust_balance_happy_path`
  - Cria conta com saldo X, chama `adjust_account_balance(account_id, novo_saldo, justificativa)`.
  - Verifica: `current_balance` atualizado, transação criada com `is_balance_adjustment=true`, delta correto, `payment_date = agora`.

- `_test_adjust_balance_idempotency`
  - Chama `adjust_account_balance` duas vezes com a mesma `idempotency_key`.
  - Verifica: apenas 1 transação criada; segunda chamada retorna o mesmo `transaction_id`.

- `_test_adjust_balance_requires_justificativa`
  - Chama com justificativa vazia/null.
  - Verifica: `RAISES EXCEPTION`.

- `_test_adjust_balance_authz`
  - Usuário sem acesso à conta (outro tenant) chama a RPC.
  - Verifica: `permission denied` / conta não encontrada.

- `_test_guard_direct_update_blocked`
  - `SET LOCAL role authenticated` e tenta `UPDATE accounts SET current_balance = ...` direto.
  - Verifica: erro do trigger `guard_of_current_balance` (sem GUC `app.balance_engine`).

- `_test_guard_allows_engine`
  - Chama `recompute_account_balance` (que seta o GUC internamente).
  - Verifica: UPDATE passa e saldo é recomputado.

- `_test_revoke_update_columns`
  - Como `authenticated`, tenta UPDATE em `initial_balance` / `current_balance`.
  - Verifica: `permission denied for column`.

- `_test_report_balance_drift`
  - Introduz drift artificial (via role privilegiada), chama `report_balance_drift`.
  - Verifica: linha retornada com `expected != actual`.

Todos rodáveis via `SELECT public._test_adjust_balance_*()` em migração de testes idempotente (drop+create), replicando o padrão atual.

### 2. Testes unitários frontend (Vitest)

Arquivo: `src/components/accounts/__tests__/AdjustAccountBalanceDialog.test.tsx`

- Renderiza saldo atual formatado (R$).
- Ao digitar novo saldo, exibe **delta** em tempo real com sinal (+/-) e cor.
- Botão "Salvar" desabilitado quando: justificativa vazia, novo saldo = atual, ou delta = 0.
- Ao submeter: chama `supabase.rpc('adjust_account_balance', { … })` com args corretos (account_id, target_balance, justification, idempotency_key único).
- Em erro da RPC (`permission denied`), exibe toast de erro e mantém dialog aberto.
- Em sucesso: fecha dialog, exibe toast, dispara invalidação de query.

Arquivo: `src/pages/__tests__/ContasBancarias.adjustBalance.test.tsx`

- Botão "Ajustar saldo" (ícone sliders) visível na linha da conta.
- Clicar abre `AdjustAccountBalanceDialog` com a conta correta.
- Confirma que `AccountFormDialog` **não** expõe mais campos `initial_balance`/`current_balance` (regressão da remoção).

### 3. Testes e2e (Playwright)

Arquivo: `e2e/adjust-account-balance.spec.py`

Reutilizar helpers de seed/cleanup do padrão atual (`_e2e_seed_foreign_accounts`, `_e2e_cleanup_*`). Criar duas RPCs auxiliares:
- `_e2e_seed_adjust_balance(user_id)` → cria conta com saldo conhecido.
- `_e2e_cleanup_adjust_balance(user_id)` → limpa transações + conta.

Cenários:
1. **Happy path**: login → Contas Bancárias → clicar sliders → digitar novo saldo + justificativa → salvar → validar toast + saldo atualizado no card + linha de ajuste visível em Lançamentos com badge/flag apropriada.
2. **Justificativa obrigatória**: tentar salvar sem justificativa → botão desabilitado.
3. **Idempotência UI**: duplo clique rápido em "Salvar" → apenas 1 transação criada (query direta ao final).
4. **Autorização**: seed de conta em outro tenant → wizard direto via `supabase.rpc` no navegador → verifica erro de permissão.
5. **Regressão UI**: abrir "Editar conta" → confirmar ausência dos campos de saldo.

## Detalhes técnicos

- SQL de teste em uma única migração `add_balance_engine_tests` seguindo `SECURITY DEFINER` + `SET search_path = public`.
- Vitest usa mocks de `@/integrations/supabase/client` como nos testes existentes.
- Playwright reusa restauração de sessão via `LOVABLE_BROWSER_SUPABASE_*` conforme padrão do projeto.
- Nenhum arquivo de app é alterado; apenas testes + migração `_test_*`.

## Entregáveis

```text
supabase/migrations/<ts>_balance_engine_tests.sql   (novas _test_* funcs)
src/components/accounts/__tests__/AdjustAccountBalanceDialog.test.tsx
src/pages/__tests__/ContasBancarias.adjustBalance.test.tsx
e2e/adjust-account-balance.spec.py
```

## Fora do escopo

- Job agendado `report_balance_drift` + tela admin (fase separada).
- Alterações no motor em si — a blindagem P0 permanece intacta.
