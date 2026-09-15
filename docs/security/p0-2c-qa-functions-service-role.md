# P0.2-C — Rotinas de QA/E2E somente com `service_role`

Data: 2026-09-15
Escopo: rotinas `_e2e_*` / `_test_*` em `public` e os scripts de E2E que as usam.
Nenhuma mudança visual, nenhum dado real alterado.

Continuação de:
- [P0 — hardening geral](./p0-security-hardening.md)
- [P0.2-A — funções financeiras](./p0-2a-finance-functions-hardening.md)
- [P0.2-B — guarda das rotinas de teste](./p0-2b-test-functions-hardening.md)

## 1. Inventário de chamadas

| Rotina | Chamada em | Grava dados |
| --- | --- | --- |
| `_e2e_seed_delete_accounts` | `e2e/contas-bancarias-delete.spec.py` | sim |
| `_e2e_cleanup_delete_accounts` | `e2e/contas-bancarias-delete.spec.py` | sim (apaga `E2E-*`) |
| `_e2e_seed_foreign_accounts` | `e2e/contas-bancarias-delete-unauthorized.spec.py` | sim |
| `_e2e_cleanup_foreign_accounts` | `e2e/contas-bancarias-delete-unauthorized.spec.py` | sim (apaga `E2E-FOREIGN-*`) |
| `_e2e_seed_adjust_balance` | `e2e/adjust-account-balance.spec.py` | sim |
| `_e2e_cleanup_adjust_balance` | `e2e/adjust-account-balance.spec.py` | sim (apaga `E2E-*`) |
| `_test_delete_account_hard_regression` | `e2e/delete-account-hard-regression.spec.py` | sim (cria e apaga `E2E-REG-*`) |
| `_test_balance_engine` | nenhuma (já era interna) | sim |
| `_test_delete_account_authz` | nenhuma (já era interna) | sim |
| `_assert_test_helper_allowed` | guarda interna | não |

Nenhuma chamada em `src/`, `scripts/` ou `supabase/functions/` — apenas `e2e/` e o
teste de segurança `src/test/rls/test_helpers_hardening.rls.test.ts`.

## 2. Nova política

- `_assert_test_helper_allowed()` autoriza **somente** `service_role` (JWT com
  `role=service_role`) ou conexão direta ao banco sem JWT (migrations,
  manutenção). O bypass por papel `super_admin` foi **removido**.
- `REVOKE EXECUTE` de `anon`, `PUBLIC` e `authenticated` em **todas** as rotinas
  `_e2e_*`/`_test_*` e na própria guarda. Somente `service_role` tem `EXECUTE`.
- Como não existe `auth.uid()` numa chamada com chave de serviço, as rotinas que
  precisavam do usuário passaram a aceitar `_user_id uuid DEFAULT NULL`
  (`auth.uid()` tem precedência quando houver sessão). Sem `_user_id` a rotina
  falha com mensagem explícita. Nomes das rotinas inalterados.
- Prefixos obrigatórios mantidos e reforçados: `E2E-`, `E2E-FOREIGN-`,
  `E2E-REG-`. Toda rotina de seed limpa os próprios registros.

## 3. Como rodar E2E com segurança

Helper único: `e2e/qa_admin.py` (`qa_rpc`, `session_user_id`). Ele roda apenas em
Python/Node de teste e nunca entra no bundle do app.

Variáveis de ambiente:

| Variável | Uso |
| --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` (ou `QA_SERVICE_ROLE_KEY`) | obrigatória para seeds/cleanup/regressão |
| `SUPABASE_URL` | opcional (default: projeto do ambiente) |
| `LOVABLE_BROWSER_SUPABASE_SESSION_JSON` | sessão do navegador; fornece o `_user_id` alvo |
| `SUPABASE_TEST_COMMON_ACCESS_TOKEN`, `SUPABASE_TEST_SUPERADMIN_ACCESS_TOKEN`, `SUPABASE_TEST_COMMON_USER_ID` | opcionais, usados pelo teste de segurança |

Sem a chave de serviço, `qa_rpc` falha com mensagem clara e o E2E não roda —
por design, sem fallback para token de usuário. **Nunca** commitar a chave nem
citá-la com valor real em docs.

## 4. Mudanças

- `supabase/migrations/20260915023000_p02c_qa_functions_service_role.sql`
  (idempotente; apenas funções e permissões).
- `e2e/qa_admin.py` (novo helper de QA server-side).
- `e2e/contas-bancarias-delete.spec.py`,
  `e2e/contas-bancarias-delete-unauthorized.spec.py`,
  `e2e/adjust-account-balance.spec.py`,
  `e2e/delete-account-hard-regression.spec.py` — seeds/cleanup via `qa_rpc`.
- `scripts/security-lint.mjs` — gate crítico `test_helpers_unguarded` agora
  reprova qualquer `EXECUTE` de `anon`/`PUBLIC`/`authenticated`. Allowlist vazia
  por design.
- `src/test/rls/test_helpers_hardening.rls.test.ts` — anon, usuário comum e
  super admin bloqueados; `service_role` com seed/cleanup quando a chave existe.

## 5. Validação

- `bunx vitest run src/test/rls src/test/tenancy` — ver seção de resultados do
  turno (0 falhas).
- `node scripts/security-lint.mjs --ci` — 0 críticos, incluindo o gate reforçado.
- `node scripts/policy-sweep.mjs` — 0 críticos.
- `node scripts/migrations-check.mjs` — aprovado.
- `bunx vite build` — aprovado.
- Prova direta no banco: usuário logado (inclusive super admin) recebe
  `permission denied` (42501/PGRST202); a guarda autoriza apenas service_role.

## 6. Riscos remanescentes (P0.3 / P1)

1. `SUPABASE_SERVICE_ROLE_KEY` não é acessível no ambiente Lovable Cloud, então
   os 4 specs de E2E que dependem de seed **não rodam aqui** até a chave ser
   fornecida no CI. Não foi criado nenhum fallback inseguro.
2. As rotinas de QA continuam existindo no banco de produção; mover para schema
   `qa`/`private` (ou removê-las) segue pendente.
3. ~250 rotinas `SECURITY DEFINER` de outros domínios (Pessoas, assinaturas,
   administração) ainda executáveis por `authenticated`.
4. Remoção definitiva do Open Finance v1; policies duplicadas/`USING (true)`;
   GRANTs faltantes nas 5 tabelas internas; ensaio de carga com 200 empresas.

> Continuação: [P0.3 — rotinas de QA fora do schema público](./p0-3-qa-functions-private-schema.md)
