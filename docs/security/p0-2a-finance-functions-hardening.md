# P0.2-A — Hardening das funções SECURITY DEFINER do domínio financeiro

Data: 2026-09-15
Escopo: apenas o domínio financeiro / Open Finance. Nada de UI, DRE, marketing ou DP.
Fase anterior: [`p0-security-hardening.md`](./p0-security-hardening.md) e
`supabase/migrations/20260915013500_p0_security_hardening_grants.sql` (fechamento de anon).

## Inventário

Consulta usada: rotinas `SECURITY DEFINER` em `public`, executáveis por `authenticated`,
com nome relacionado a `account|saldo|balance|transaction|credit_card|invoice|pluggy|
open_finance|sync|staging|categoriz|chart_account|audit`. Resultado: 71 rotinas.
Cada uma foi cruzada com buscas literais em `src/` e `supabase/functions/`.

### (a) RPC app-facing — permanece em `public` com `authenticated`

Chamada direta pelo front ou por Edge Function com JWT do usuário:

`adjust_account_balance`, `apply_ai_categorization`, `apply_chart_account_suggestions`,
`categorize_transaction`, `categorize_transactions_batch`,
`category_templates_apply_chart_accounts`, `chart_account_move`, `chart_accounts_ensure`,
`chart_accounts_ledger`, `chart_accounts_pending_classification`, `chart_accounts_report`,
`chart_accounts_resequence`, `chart_accounts_restore_default`, `credit_card_other_company`,
`delete_account`, `enqueue_uncategorized_for_ai`, `get_accessible_accounts`,
`insert_audit_log`, `pay_credit_card_invoice`, `plin_ia_accounts_balance`,
`plin_ia_by_account`, `plin_ia_search_transactions`, `pluggy_cancel_connect_requests`,
`pluggy_confirm_staging` (2 assinaturas), `pluggy_confirm_staging_card`,
`pluggy_confirm_staging_split`, `pluggy_confirm_staging_transfer` (2 assinaturas),
`pluggy_ignore_staging`, `recompute_all_account_balances`, `resolve_balance_drift`,
`revert_chart_account_suggestion_batch`, `run_balance_drift_scan`.

Decisão: **nenhuma alteração** — mudar nome/schema quebraria contrato do app.

### (b) Helper interno — `EXECUTE` revogado de `authenticated`

Chamado somente por outras rotinas `SECURITY DEFINER` (execução como owner, portanto
não afetada) ou por Edge Function com `service_role`:

| Função | Chamador interno |
| --- | --- |
| `assign_transaction_to_invoice` | `tg_transactions_assign_cc_invoice` |
| `recalc_credit_card_invoice_totals` | `pay_credit_card_invoice`, `close_credit_card_invoices`, `assign_transaction_to_invoice`, `tg_transactions_assign_cc_invoice` |
| `recompute_account_balance` | `recompute_all_account_balances`, `guard_of_current_balance`, `pluggy_confirm_staging_transfer`, `promote_to_transfer` |
| `soft_delete_account` | `prevent_hard_delete_account_with_history` |
| `report_balance_drift` | `run_balance_drift_scan`, `_test_balance_engine` |
| `chart_account_next_code` | `chart_account_autofill_code`, `chart_account_move` |
| `chart_accounts_seed_default` | `chart_accounts_restore_default` |
| `sync_of_account_balance` | `pluggy-sync-item` (cliente `service_role`) |

Open Finance legado, sem nenhuma chamada em `src/` nem em `supabase/functions/`:
`create_and_link_open_finance_account`, `link_open_finance_account`,
`ignore_open_finance_account`, `ignore_open_finance_raw`,
`promote_open_finance_transactions`, `open_finance_sync_health`.

### (c) Trigger / internal only — `EXECUTE` revogado de `authenticated`

`audit_pluggy_v2_raw_delete`, `chart_account_autofill_code`, `guard_of_current_balance`,
`guard_transaction_category_active`, `learn_categorization_rule`,
`pluggy_sync_pause_on_account_toggle`, `prevent_hard_delete_account_with_history`,
`seed_default_account_on_company`, `tg_transactions_assign_cc_invoice`.

### (d) Fica para P0.2-B

- `_e2e_seed_*`, `_e2e_cleanup_*`, `_test_delete_account_hard_regression`,
  `_test_balance_engine`, `_test_delete_account_authz`: rotinas de teste que gravam dados e
  hoje são executáveis por qualquer usuário logado. Precisam de guarda por papel ou de
  remoção do banco de produção — o E2E depende delas com sessão autenticada.
- Mover helpers para o schema `private` com wrappers públicos (aqui optou-se por apenas
  revogar `EXECUTE`, que atinge o mesmo efeito de segurança sem alterar assinaturas).
- Revisão dos ~250 restantes `SECURITY DEFINER` `authenticated` de outros domínios (DP,
  assinaturas, admin).
- Policies duplicadas / `USING (true)` remanescentes e GRANTs faltantes nas 5 tabelas
  internas (`auth_login_identifiers`, `auth_rate_limits`, `auth_recovery_challenges`,
  `cnpj_cache`, `dp_cargos`).

## Mudanças aplicadas

- `supabase/migrations/20260915020000_p02a_finance_functions_hardening.sql` (idempotente,
  sem `INSERT/UPDATE/DELETE`): revoga `ALL` de `PUBLIC`, `anon` e `authenticated` e garante
  `GRANT EXECUTE ... TO service_role` nas 23 rotinas das categorias (b) e (c).
- Nenhuma função foi recriada; portanto os `SET search_path = public` já existentes em
  todas elas permanecem intactos (verificado no inventário: `cfg=search_path=public`).
- `scripts/security-lint.mjs`: novo check crítico `finance_internal_functions_authenticated`
  com a lista documentada — falha se qualquer uma voltar a ser executável por
  `authenticated`/`anon`.
- `src/test/rls/finance_internal_functions.rls.test.ts`: 46 casos (23 anon + 23 com sessão,
  estes ativados por `SUPABASE_TEST_ACCESS_TOKEN`).

## Como testar

```bash
bunx vitest run src/test/rls src/test/tenancy
node scripts/security-lint.mjs --ci
node scripts/policy-sweep.mjs
node scripts/migrations-check.mjs
bunx vite build
```

Prova manual executada com sessão autenticada real (token mintado no ambiente):
as 8 rotinas internas sondadas responderam `403 / 42501 permission denied`
(`open_finance_sync_health` responde `404 PGRST202`), enquanto
`get_accessible_accounts` e `recompute_all_account_balances` (que chama internamente
`recompute_account_balance`) seguem respondendo `200`.

## Riscos remanescentes

- Rotinas de teste `_e2e_*`/`_test_*` gravam dados e seguem abertas a usuários logados
  (P0.2-B).
- Open Finance legado (v1) continua no banco, agora fechado; a remoção definitiva depende
  de confirmar que nenhum cliente usa o fluxo antigo.
- Nenhum helper foi movido para `private`; o gate do lint é o que impede regressão de grants.

> Continuação: [P0.2-C — rotinas de QA somente com service_role](./p0-2c-qa-functions-service-role.md)
