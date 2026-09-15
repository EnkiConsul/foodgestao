# P0.3 — Rotinas de QA/E2E fora do schema exposto (`public` → `qa`)

Data: 2026-09-15
Escopo: rotinas `_e2e_*`, `_test_*` e a guarda `_assert_test_helper_allowed`.
Nenhuma mudança visual, nenhum dado real alterado.

Continuação de:
- [P0 — hardening geral](./p0-security-hardening.md)
- [P0.2-A — funções financeiras](./p0-2a-finance-functions-hardening.md)
- [P0.2-B — guarda das rotinas de teste](./p0-2b-test-functions-hardening.md)
- [P0.2-C — QA somente com service_role](./p0-2c-qa-functions-service-role.md)

## 1. Inventário (antes → depois)

Todas em `public` e restritas a `service_role` (P0.2-C); agora em `qa`:

| Rotina | Retorno | Situação final |
| --- | --- | --- |
| `_e2e_seed_delete_accounts(_empty_name, _history_name, _user_id)` | TABLE | `qa`, só `service_role` |
| `_e2e_cleanup_delete_accounts(_names, _user_id)` | void | `qa`, só `service_role` |
| `_e2e_seed_foreign_accounts(_empty_name, _history_name, _user_id)` | TABLE | `qa`, só `service_role` |
| `_e2e_cleanup_foreign_accounts(_empty_name, _history_name)` | void | `qa`, só `service_role` |
| `_e2e_seed_adjust_balance(_account_name, _user_id)` | uuid | `qa`, só `service_role` |
| `_e2e_cleanup_adjust_balance(_account_name, _user_id)` | void | `qa`, só `service_role` |
| `_test_delete_account_hard_regression(_user_id)` | jsonb | `qa`, só `service_role` |
| `_test_balance_engine()` | text | `qa`, só `service_role` |
| `_test_delete_account_authz()` | text | `qa`, só `service_role` |
| `_assert_test_helper_allowed()` | void | `qa`, só `service_role` |

Resultado: **zero** rotinas de QA em `public`.

## 2. Decisão técnica

- Novo schema `qa`, fechado por padrão (`REVOKE ALL ... FROM PUBLIC/anon/authenticated`,
  `GRANT USAGE ... TO service_role`). O PostgREST expõe apenas
  `public`/`graphql_public`, então essas rotinas **deixam de existir como RPC HTTP**
  — inclusive para a chave de serviço.
- Rotinas movidas com `ALTER FUNCTION ... SET SCHEMA qa`; nomes, assinaturas e
  comportamento preservados (incluindo prefixos obrigatórios `E2E-`,
  `E2E-FOREIGN-`, `E2E-REG-` e a limpeza dos próprios registros).
- Referências internas `public._assert_test_helper_allowed` reescritas para
  `qa._assert_test_helper_allowed` (recriação via `pg_get_functiondef`), com o
  `SET search_path = public` original mantido — as tabelas de negócio continuam
  em `public`.
- A guarda segue autorizando somente `service_role` ou conexão direta sem JWT.
  Camadas agora: schema não exposto + grants + guarda fail-closed.
- A migration termina com verificação fail-closed: aborta se sobrar qualquer
  rotina de QA em `public`.

## 3. Como rodar E2E com segurança

`e2e/qa_admin.py` passou a executar as rotinas por **conexão direta ao banco**
(`psql`), sem rota HTTP. Sem fallback com token de usuário.

A URL de conexão **não** vai no argv do `psql`: o helper a parseia e repassa por
variáveis libpq (`PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`,
`PGSSLMODE` e afins, incluindo query string como `sslmode=require`), evitando
senha em process list ou log de CI. Além disso, `qa_rpc` só aceita rotinas de uma
**allowlist explícita** (as 9 rotinas de QA), que também declara o tipo de
retorno (`set`/`void`/`scalar`) — não é possível chamar qualquer objeto de `qa`.

| Variável | Uso |
| --- | --- |
| `SUPABASE_DB_URL` (ou `QA_DB_URL`) | obrigatória: conexão direta do CI para seeds/cleanup/regressão |
| `LOVABLE_BROWSER_SUPABASE_SESSION_JSON` | sessão do navegador; fornece o `_user_id` alvo |

Sem a URL de conexão, `qa_rpc` falha com mensagem clara e o E2E não roda — por
design. Nunca commitar credenciais nem citá-las com valor real em docs.

## 4. Mudanças

- `supabase/migrations/20260915030000_p03_qa_functions_private_schema.sql`
  (idempotente; só schema/funções/permissões).
- `e2e/qa_admin.py` — execução via `psql` com `SUPABASE_DB_URL`; a assinatura de
  `qa_rpc(name, payload)` não mudou, então os 4 specs continuam iguais.
- `scripts/security-lint.mjs` — gate crítico `test_helpers_unguarded` agora
  reprova rotina de QA em `public` **e** qualquer `EXECUTE` de
  `anon`/`PUBLIC`/`authenticated`. Allowlist vazia por design.
- `src/test/rls/test_helpers_hardening.rls.test.ts` — anon, usuário comum e
  super admin bloqueados; prova de que `qa.` não é chamável por HTTP nem com
  chave de serviço.

## 5. Validação

- `bunx vitest run src/test/rls src/test/tenancy` — 0 falhas.
- `node scripts/security-lint.mjs --ci` — 0 críticos.
- `node scripts/policy-sweep.mjs` — 0 críticos.
- `node scripts/migrations-check.mjs` — aprovado.
- `bunx tsgo --noEmit` e `bunx vite build` — aprovados.
- Prova no banco: as 10 rotinas aparecem em `qa` com ACL
  `{postgres=X, service_role=X}` e nada em `public`.

## 6. Riscos remanescentes (P1)

1. `SUPABASE_DB_URL` com papel dono não está disponível no ambiente Lovable
   Cloud (o papel do sandbox não tem `USAGE` em `qa`), então os 4 specs que
   dependem de seed **não rodam aqui** até o CI fornecer a URL. Nenhum fallback
   inseguro foi criado.
2. ~250 rotinas `SECURITY DEFINER` de outros domínios (Pessoas, assinaturas,
   administração) ainda executáveis por `authenticated`.
3. Remoção definitiva do Open Finance v1; policies duplicadas/`USING (true)`;
   GRANTs faltantes nas 5 tabelas internas; ensaio de carga com 200 empresas.
