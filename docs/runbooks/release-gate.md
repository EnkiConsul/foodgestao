# Runbook — Release Gate obrigatório

O release só é liberado quando o workflow `Release Gate`
(`.github/workflows/release-gate.yml`) termina com o job `✅ Release gate` em
sucesso. Nenhuma etapa pode ser ignorada por falta de secret: ausência de
credencial reprova o gate.

## Etapas bloqueantes

| Job | O que valida | Script |
| --- | --- | --- |
| `static` | TypeScript strict, ESLint (teto 546 warnings), `deno check` de todas as edge functions, análise estática das migrations, build de produção | `scripts/deno-check.mjs`, `scripts/migrations-check.mjs` |
| `tests` | Vitest (unit + RLS) | `npm test` |
| `tenancy` | Tenancy real multiempresa contra banco de testes (A/B/C na Empresa 1, D na Empresa 2) — falha se os secrets faltarem, para nunca passar com `describe.skip` | `src/test/tenancy`, `src/test/rls` |
| `security` | `security-lint --ci --strict` + `policy-sweep` no banco de staging | `scripts/security-lint.mjs`, `scripts/policy-sweep.mjs` |
| `migrations-backup` | `supabase db push --dry-run` (nada pendente) + drill de backup/restore em Postgres limpo | `scripts/migrations-check.mjs`, `scripts/backup-restore-drill.mjs` |
| `e2e` | Specs Playwright (`e2e/*.spec.py`) contra `vite preview` | `scripts/run-e2e.mjs` |
| `staging-smoke` | Smoke do checkout em staging: app no ar, plano ativo, rota `/checkout/:slug`, `validate-coupon` rejeitando cupom inválido, `asaas-create-checkout` negando anônimo | `scripts/smoke-checkout.mjs` |

## Secrets exigidos

```
STAGING_SUPABASE_DB_URL
TEST_SUPABASE_URL              TEST_SUPABASE_ANON_KEY
TEST_USER_A_EMAIL/_PASSWORD    TEST_USER_B_EMAIL/_PASSWORD
TEST_USER_C_EMAIL/_PASSWORD    TEST_USER_D_EMAIL/_PASSWORD
TEST_COMPANY_1_ID              TEST_COMPANY_2_ID
SMOKE_BASE_URL                 SMOKE_SUPABASE_URL   SMOKE_SUPABASE_ANON_KEY
SMOKE_PLAN_SLUG (opcional)     SMOKE_USER_EMAIL/_PASSWORD (opcional)
```

`RESTORE_DB_URL` é fornecido pelo serviço `postgres:15` do próprio job — não é
secret.

## Rodando localmente

```bash
npm run release:gate                 # roda o que houver credencial
npm run release:gate:strict          # modo gate: etapa sem credencial reprova
npm run release:gate -- --only=typescript,tests
npm run release:gate -- --skip=e2e,backup
```

Relatórios ficam em `reports/` (`release-gate.json`, `security-lint.json`,
`policy-sweep.json`, `backup-restore.json`, `smoke-checkout.json`) e são
publicados como artifacts no CI.

## Cobrança real no smoke

Por padrão o smoke **não** cria cobrança. Para exercitar o caminho completo,
dispare o workflow manualmente (`workflow_dispatch`) com `with_charge = true` e
os secrets `SMOKE_USER_EMAIL`/`SMOKE_USER_PASSWORD` de um usuário de teste em
staging. Nunca aponte o smoke com cobrança para produção.

## Branch protection

Em `Settings → Branches → main`, marque como required status checks:

- `✅ Release gate`
- `Verifica congelamento da main` (freeze — ver `docs/runbooks/release-freeze.md`)

## Falhas comuns

| Sintoma | Ação |
| --- | --- |
| `Gate de tenancy exige secrets ausentes` | Cadastre os secrets `TEST_*`; sem eles a suíte auto-skipa e o gate não teria valor |
| `há migrations não aplicadas no banco alvo` | Aplique as migrations em staging antes de liberar |
| `public.<tabela> criada sem GRANT` | Corrija a migration: `CREATE TABLE` → `GRANT` → `ENABLE RLS` → `CREATE POLICY` |
| `deno check` falhando | Corrija tipos/imports na edge function apontada |
| `pg_restore falhou` | Dump inconsistente: investigue extensões/objetos fora de `public` antes do release |
| `asaas-create-checkout` aceitando anônimo | Regressão de segurança — bloqueie o release e corrija a função |

## Baselines (ratchet decrescente)

Duas listas evitam que dívidas herdadas travem o gate no dia 1 — ambas só devem
encolher:

- `scripts/deno-check.baseline.json` — edge functions com falha de `deno check`
  herdada. Função nova que falha reprova o gate; ao corrigir uma da lista, o
  script avisa para removê-la.
- `MIGRATIONS_BASELINE` (default `20260828000000` em
  `scripts/migrations-check.mjs`) — migrations anteriores ao timestamp ficam fora
  das regras de GRANT/RLS/statements proibidos. Toda migration nova é validada.
- `scripts/quality-ceilings.json` — tetos de erros TS strict, erros e warnings do
  ESLint (`node scripts/quality-ceilings.mjs typescript|eslint`). O gate reprova
  se a contagem subir; quando cai, o script avisa para baixar o teto.

## Estado no dia da criação do gate (27/08/2026)

| Métrica | Valor |
| --- | --- |
| Erros TS strict | 33 |
| Erros ESLint | 16 |
| Warnings ESLint | 1473 |
| Edge functions falhando `deno check` | 18 (baseline) |
| Testes | 937 passando, 1 falhando (`operacao-panorama.test.ts` → `trabalhando` com convocado pendente) |

O teste de `operacao-panorama` é a única etapa realmente vermelha: a expectativa
espera que convocado pendente conte como "trabalhando" e o motor atual conta
apenas o aceito. Decida a regra de negócio e ajuste teste ou motor antes do
primeiro release passar pelo gate.
