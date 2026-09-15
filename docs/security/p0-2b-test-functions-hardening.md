# P0.2-B — Hardening das rotinas de teste/E2E expostas em produção

Continuação de [`p0-security-hardening.md`](./p0-security-hardening.md) e
[`p0-2a-finance-functions-hardening.md`](./p0-2a-finance-functions-hardening.md).

Migration: `supabase/migrations/20260915022000_p02b_test_functions_hardening.sql`
(idempotente, apenas permissões + redefinição de funções; nenhum INSERT/UPDATE/DELETE
em dados reais).

## 1. Inventário

Todas as rotinas `SECURITY DEFINER` em `public` com prefixo `_e2e_`/`_test_`
(nenhum outro helper de QA/debug foi encontrado no schema):

| Função | Assinatura | Grava dados? | Onde é chamada | Situação antes |
| --- | --- | --- | --- | --- |
| `_e2e_seed_delete_accounts` | `(text, text)` | sim (contas + lançamento `E2E-*`) | `e2e/contas-bancarias-delete.spec.py` | authenticated |
| `_e2e_cleanup_delete_accounts` | `(text[])` | sim (remove só `E2E-*` do próprio usuário) | idem | authenticated |
| `_e2e_seed_foreign_accounts` | `(text, text)` | sim (contas `E2E-FOREIGN-*` de outro usuário) | `e2e/contas-bancarias-delete-unauthorized.spec.py` | authenticated |
| `_e2e_cleanup_foreign_accounts` | `(text, text)` | sim (remove só `E2E-FOREIGN-*`) | idem | authenticated |
| `_e2e_seed_adjust_balance` | `(text)` | sim (conta de saldo) | `e2e/adjust-account-balance.spec.py` | authenticated |
| `_e2e_cleanup_adjust_balance` | `(text)` | sim | idem | authenticated |
| `_test_delete_account_hard_regression` | `()` | sim (contas/cartão/fatura temporários, com cleanup próprio) | `e2e/delete-account-hard-regression.spec.py` | authenticated |
| `_test_balance_engine` | `()` | sim (transitório) | migration histórica | já só `service_role` |
| `_test_delete_account_authz` | `()` | sim (transitório) | migration histórica | já só `service_role` |

Todas dependiam apenas de `auth.uid()` não nulo — isto é, qualquer cliente logado
podia executá-las contra dados reais.

## 2. Mecanismo de autorização escolhido

Reutiliza o RBAC existente (`public.user_roles` + `public.has_role`), sem criar
tabela, flag ou segredo novo. Nova guarda `public._assert_test_helper_allowed()`
(`SET search_path = public`, `SECURITY INVOKER`, decide pela credencial da
requisição):

1. `role = service_role` no JWT → autorizado (Edge Functions/CI com chave de serviço);
2. sem JWT algum (conexão direta: migrations, cron, manutenção) → autorizado;
3. usuário logado **com papel `super_admin`** → autorizado (QA/E2E);
4. qualquer outro caso → `RAISE EXCEPTION ... ERRCODE 42501` (**fail closed**).

Nenhum segredo é embutido no cliente: a suíte E2E usa a sessão real do operador
super admin injetada pelo ambiente.

## 3. Mudanças aplicadas

- `_e2e_*` (6) e `_test_delete_account_hard_regression`: `PERFORM public._assert_test_helper_allowed();`
  como **primeira instrução**, antes de qualquer escrita. Corpos e contratos
  preservados (nomes, argumentos e retornos idênticos — E2E não muda).
- `anon`/`PUBLIC`: `REVOKE ALL` em todas as rotinas `_e2e_*`/`_test_*`.
- `service_role`: `GRANT EXECUTE` em todas.
- `authenticated`: mantido apenas nas 7 usadas pela suíte E2E (porta de entrada;
  a autorização real é a guarda). `_test_balance_engine` e
  `_test_delete_account_authz` seguem sem `authenticated`.
- Cleanup próprio das rotinas preservado (`E2E-`/`E2E-FOREIGN-` obrigatórios;
  `_test_delete_account_hard_regression` remove cartão, fatura e contas criadas).
- Sem cross-company: os seeds continuam restritos ao usuário chamador (ou, no
  caso `FOREIGN`, a contas com prefixo dedicado, criadas e apagadas pela própria rotina).

## 4. Gate automatizado

`scripts/security-lint.mjs`: novo check crítico `test_helpers_unguarded` —
falha se qualquer `_e2e_*`/`_test_*` for executável por `anon`, ou executável por
`authenticated` sem a guarda no corpo. Cobre também rotinas de teste novas.

## 5. Testes

- `src/test/rls/test_helpers_hardening.rls.test.ts` — visitante bloqueado em
  todas as rotinas; usuário logado comum bloqueado com 42501 quando
  `SUPABASE_TEST_COMMON_ACCESS_TOKEN` está disponível.
- Prova direta no banco (sessão simulada de usuário logado sem `super_admin`):
  `_e2e_cleanup_adjust_balance` → `42501 permission denied: rotina de teste requer
  service_role ou papel super_admin`. Com `sub` de um `super_admin`: execução
  autorizada (transação revertida).

## 6. Riscos remanescentes (P0.2-C)

- Rotinas de teste ainda existem no banco de produção; o ideal é movê-las para um
  schema `qa`/private ou para migrations de ambiente de teste.
- ~250 rotinas `SECURITY DEFINER` `authenticated` de outros domínios (DP,
  assinaturas, admin) ainda sem revisão.
- Remoção definitiva do Open Finance v1.
- Policies duplicadas e `USING (true)` remanescentes.
- GRANTs faltantes nas 5 tabelas internas (`auth_login_identifiers`,
  `auth_rate_limits`, `auth_recovery_challenges`, `cnpj_cache`, `dp_cargos`).
- Ensaio de carga/tenancy com 200 empresas.

> Continuação: [P0.2-C — rotinas de QA somente com service_role](./p0-2c-qa-functions-service-role.md)

> Continuação: [P0.3 — rotinas de QA fora do schema público](./p0-3-qa-functions-private-schema.md)
