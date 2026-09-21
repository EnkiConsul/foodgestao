# D3 — Auditoria do onboarding e do ambiente de testes (sandbox/homologação)

Fase somente diagnóstico. Nenhuma empresa/usuário criado, nenhum CNPJ real consultado,
nenhuma conexão alterada, nada publicado, nenhuma DDL aplicada.

Produção auditada: `grtxmbffgmgnkawlvqhm`. Projeto de homologação informado: `utjhzpdbqzajrhnzcher`
(nenhuma referência a ele existe no repositório — ver A4).

## Resumo dos achados

| # | Achado | Gravidade |
|---|--------|-----------|
| A1 | Preview e desenvolvimento local apontam para o banco de **produção**; não existe segunda conexão | Alto |
| A2 | Onboarding grava direto em produção via RPC `SECURITY DEFINER`, sem flag de ambiente | Alto |
| A3 | E2E Playwright rodam contra `localhost:8080`, que usa o banco de produção | Alto |
| A4 | Nenhuma referência ao projeto de homologação no código do app; scripts de staging exigem variáveis cuja configuração **não foi inspecionada** e um script que não existe no repositório | Alto |
| A5 | `ContactFormDialog` consulta a Receita automaticamente ao digitar (debounce 600 ms); onboarding só consulta por clique | Médio |
| A6 | Não há provedor de CNPJ simulável (URL fixa no código da função) nem fixtures de onboarding/CNPJ | Médio |
| A7 | Onboarding **não** dispara checkout nem e-mail — risco menor do que o esperado | Informativo |

## Evidências

### A1 — uma única conexão, e ela é produção
- `src/integrations/supabase/client.ts:6-7` lê `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`; arquivo é autogerado e não editável.
- `.env` contém apenas `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_LOVABLE_CONNECTOR_LOGO_DEV_API_KEY`; as duas ocorrências do ref são do projeto de produção e **zero** do ref de homologação.
- `supabase/config.toml:1` → `project_id = "grtxmbffgmgnkawlvqhm"` (um único `config.toml`). Isso define o **alvo padrão** do CLI quando nenhum destino é informado; não implica destino sempre produção — `--project-ref`, um projeto linkado ou `SUPABASE_DB_URL` explícito prevalecem.
- Busca por `staging|homolog|sandbox|VITE_APP_ENV|isPreview` em `src/`: **nenhuma** ocorrência em código de aplicação (apenas em `scripts/`).

Conclusão: sim — o preview usa o banco de produção. Qualquer cadastro feito "para testar" é dado real.

### A2 — caminho de gravação do onboarding
- `src/pages/Onboarding.tsx:155` → `checkOnboardingCnpj` (edge `check-onboarding-cnpj`); `:180-206` → `submit.mutateAsync`.
- `src/hooks/useOnboardingSubmit.tsx:36` → `supabase.rpc("fn_cadastrar_empresa_onboarding")`.
- `supabase/migrations/20260715181826_…sql:92-185` (versão final em `20260715184211_…sql`): função `SECURITY DEFINER, search_path=public`. Valida `auth.uid()`, módulos, 14 dígitos e CNPJ já cadastrado; faz upsert em `profiles`; insere `companies` com `status_tenant='trial'` e trial de 14 dias; insere `company_modules` em `trial` por slug (`ON CONFLICT DO NOTHING`). Na versão final o vínculo de proprietário **não** é inserido pela RPC — vem do gatilho `a_auto_add_company_owner` (renomeado em `20260826172825_…sql:2-5`).
- `…184320_…sql:1-11`: `EXECUTE` revogado de `PUBLIC`/`anon`, concedido a `authenticated` — menor privilégio correto.
- Seeds de empresa rodam por **triggers** em `public.companies` (categorias, plano de contas, contatos, formas de pagamento, módulos, documentos de Pessoas 360°, configuração de DP) — ver `.lovable/plan/corrigir-erro-ao-concluir-o-onboarding-2026-08-26.md`. Ou seja: um cadastro de teste cria dezenas de registros dependentes, sem rollback.
- Não existe nenhuma checagem de ambiente na RPC nem no frontend antes de gravar.

### A3 — E2E contra produção
- `scripts/run-e2e.mjs:13` → `E2E_BASE_URL` default `http://localhost:8080`; `:46-52` executa `e2e/*.spec.py` contra essa base, que carrega o `.env` de produção.
- Specs existentes mexem em contas bancárias (`e2e/adjust-account-balance.spec.py`, `contas-bancarias-delete.spec.py`, `delete-account-hard-regression.spec.py`).

### A4 — infraestrutura de staging declarada mas incompleta
- `scripts/preflight-secrets.mjs:29-81` declara os grupos `staging-db` (`STAGING_SUPABASE_DB_URL`, obrigatório), `tenancy` (`TEST_SUPABASE_URL`, usuários A–D…), `smoke-checkout` (`SMOKE_BASE_URL`, `SMOKE_SUPABASE_URL`, `SMOKE_SUPABASE_ANON_KEY`), `asaas-sandbox`, `pluggy-sandbox` e `seed-staging` (`STAGING_SUPABASE_URL`, `STAGING_SERVICE_ROLE_KEY`). **Não foi inspecionado** se esses segredos estão configurados no CI ou no ambiente — este relatório não afirma ausência, apenas que o código os exige.
- `scripts/seed-staging.mjs` **não existe** no repositório (`ls scripts | grep seed` vazio), embora seja citado em `preflight-secrets.mjs:80`.
- O banco de homologação `utjhzpdbqzajrhnzcher` **já está provisionado** (catálogo bootstrapped, ~216 tabelas, usuários de teste A–D e fixtures). Nada de reaplicar o histórico de migrations nem recriar esses usuários/fixtures; ver `docs/runbooks/ambiente-homologacao.md`, seção 4.
- `.github/workflows/release-gate.yml:136-171,275` e `staging-security-gate.yml:11-57` já consomem `STAGING_SUPABASE_DB_URL` — o gate de segurança presume um banco de homologação, mas o app nunca aponta para ele.
- Smokes prontos e isoláveis: `scripts/smoke-asaas-sandbox.mjs` (exige URL contendo `sandbox`, `:59-60`), `scripts/smoke-pluggy-sandbox.mjs`, `scripts/smoke-checkout.mjs`.

Portanto o relato do usuário ("não existe ambiente de teste") está correto na prática: existe **tubulação de CI** para staging, não existe ambiente de aplicação.

### A5/A6 — provedor de CNPJ
- `supabase/functions/lookup-cnpj/index.ts`: provedor real **BrasilAPI** (`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`), URL fixa em código; exige JWT válido (`getClaims`); cache em `cnpj_cache` com TTL 30 dias; `force:true` ignora o cache; timeout 8 s; degradação para cache velho em 429/5xx/rede. Nenhuma variável de ambiente de provedor, modo mock ou chave de teste.
- Onboarding: consulta só por clique — `src/components/shared/CnpjInput.tsx:40-49,68-78` (botão), usado em `src/components/onboarding/food/StepEmpresa.tsx:76-80`. Cache de cliente 6 h em `src/hooks/useCnpjLookup.tsx:26,40-45`.
- Contatos: **automática** ao completar 14 dígitos válidos — `src/components/contacts/ContactFormDialog.tsx:255-262` (debounce 600 ms, `runLookup` em `:223-246`). É a única chamada não intencional à Receita hoje; mitigada pelo cache, mas dispara em digitação/colagem.
- `check-onboarding-cnpj/index.ts` usa `service_role` para ler `companies`/`company_members` e responde apenas `available|registered|accessible` — não vaza dados de terceiros. Correto.
- Testes/fixtures existentes: `src/lib/onboardingStatus.test.ts` (mocka `functions.invoke`, CNPJ fictício `58.241.366/0001-32`), `src/test/unit/onboardingStatusTimeout.test.ts`, `src/lib/onboardingFinalize.test.ts`, `src/routes/onboardingGuards.test.tsx`. **Não existe** teste do passo final (`fn_cadastrar_empresa_onboarding`), nem do `lookup-cnpj`, nem fixture de payload BrasilAPI.

### A7 — efeitos colaterais
- `handleConcluir` (`src/pages/Onboarding.tsx:180-227`) chama só a RPC e `marcarOnboardingConcluido`; `StepSucesso.tsx` é apenas apresentação. **Nenhuma** chamada a `asaas-create-checkout` ou a envio de e-mail no fluxo de onboarding.
- Efeitos indiretos a considerar em homologação: e-mail de confirmação do GoTrue no signup (`auth-email-hook`), `expire-trials` (cron) e webhooks Asaas/Pluggy — todos por projeto, portanto isolados se o projeto for separado.

## Proposta mínima de ambiente de homologação isolado

Sem criar projeto novo nem contratar serviços: usar o projeto já existente `utjhzpdbqzajrhnzcher`.

1. **Build apontável por modo** (frontend, sem tocar `.env` de produção): criar `.env.staging` com as três variáveis `VITE_SUPABASE_*` do projeto de homologação e rodar `vite --mode staging` / `vite build --mode staging`. `client.ts` já lê de `import.meta.env`, então nenhuma mudança de código é necessária. Adicionar scripts `dev:hom` e `build:hom` no `package.json`.
2. **Faixa visível de ambiente**: derivar de `VITE_SUPABASE_PROJECT_ID` (não de query param) uma tarja "HOMOLOGAÇÃO" no topo, para impedir confusão. Zero efeito quando o ref é o de produção.
3. **Paridade de schema por leitura**: o banco de homologação já está provisionado (~216 tabelas, fixtures em uso), então **não** se reaplica o histórico de `supabase/migrations` nele — comparar catálogo hom × prod em consultas somente leitura e, se faltar algo, aplicar apenas migration nova e incremental, com autorização. `npm run migrations:check` e `npm run security-lint` seguem valendo como conferência.
4. **Deploy das funções em homologação** via `supabase functions deploy --project-ref <hom>` e segredos próprios: chave Asaas **sandbox**, credenciais Pluggy **sandbox**, chave de e-mail em modo teste (ou domínio de captura). Nunca copiar segredos de produção.
5. **Garantias no servidor de homologação** (sem bypass em produção):
   - Provedor de CNPJ configurável por variável na própria função: `CNPJ_PROVIDER=brasilapi|fixture`. Em `fixture`, a função responde do `cnpj_cache`/tabela de fixtures e **nunca** faz `fetch` externo. Em produção a variável fica ausente e o comportamento é idêntico ao atual — sem CNPJ mágico, sem query param, sem bypass.
   - `expire-trials` e crons desligados ou com agenda própria em homologação.
   - Webhooks Asaas/Pluggy de homologação apontando somente para as funções do projeto de homologação.
6. **Dados de teste já existentes**: usuários A–D e fixtures **já estão** no banco de homologação — não recriar. Se `scripts/seed-staging.mjs` (hoje só citado) vier a existir, deve ser idempotente, detectar o que já está lá e apenas complementar, usando `STAGING_SUPABASE_URL`/`STAGING_SERVICE_ROLE_KEY`.
7. **E2E deixam de mirar produção**: exigir `E2E_BASE_URL` apontando para o build de homologação e abortar quando o ref do backend for o de produção (guarda em `scripts/run-e2e.mjs`).
8. **Testes locais sem rede** (podem ser feitos já, nesta fase): fixture do payload BrasilAPI + testes de `useCnpjLookup` (cache 6 h, erros `timeout`/`not_found`/`rate_limited`) e do passo final do onboarding com `rpc` mockada, cobrindo `empresa_ja_cadastrada`, `cnpj_invalido`, `nenhum_modulo_selecionado`.

## O que falta, em uma linha

Falta apenas ligar o app ao projeto de homologação já existente (feito nesta fase: `.env.homologacao` + scripts `dev:hom`/`build:hom`), mais o deploy das funções nesse ref, os segredos sandbox, o provedor de CNPJ em modo fixture por variável de servidor e a guarda nos E2E. Schema e dados de teste já existem em homologação e não devem ser reaplicados nem recriados.
