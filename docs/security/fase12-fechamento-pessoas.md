# Fase 12 — Fechamento técnico do módulo Pessoas

Data: 2026-09-15 · Escopo: revisão dos apontamentos do security-lint, menor
privilégio de execução, RLS/multiempresa, Edge Functions, repositório/CI,
ambiente/segredos, código legado e testes finais. Nenhum dado real alterado,
nenhum publish.

## 1. Diagnóstico do security-lint

`scripts/security-lint.mjs` (16 checks) executado com o banco do projeto:

| Momento | Críticos | Avisos |
| --- | --- | --- |
| Antes | 0 | 260 (`0029_authenticated_security_definer`) + 1 (`function_search_path_mutable`) |
| Depois | 0 | 225 (`0029`) |

Os "63 apontamentos" do histórico foram tratados nas fases P0 → P0.4; o
baseline atual é o acima, reproduzido por consulta direta ao catálogo.

Além disso o scanner da plataforma apontou 3 itens: 1 já dispensado pelo
usuário, 1 de metadados de documento disciplinar e 1 de cláusula
desnecessária em `dp_colaborador_of`/`dp_colaborador_ativo_of` — os dois
últimos foram corrigidos nesta fase.

## 2. Classificação dos 260 avisos `SECURITY DEFINER` → `authenticated`

| Grupo | Qtd | Real? | Prioridade | Decisão |
| --- | --- | --- | --- | --- |
| Funções de gatilho (`RETURNS trigger`) | 35 | risco baixo, privilégio desnecessário | P1 | **Corrigido** — `REVOKE ALL` de anon/authenticated/PUBLIC |
| RPCs app-facing chamadas pelo frontend/Edge | 145 | falso positivo (necessidade arquitetural) | — | Mantidas |
| Helpers chamados por outras funções/policies do banco | 80 | falso positivo | P2 | Mantidas (todas com referência em código ou no banco) |

Critérios para manter: derivam identidade de `auth.uid()`, não confiam em
`company_id` do cliente, `search_path` fixo (`function_search_path_mutable`
= 0 achados), EXECUTE apenas para `authenticated`/`service_role`.

## 3. Correções aplicadas

Migration `supabase/migrations/20260915160000_fase12_menor_privilegio_pessoas.sql`:

1. `REVOKE ALL` nas 35 funções de gatilho (gatilhos seguem funcionando: a
   permissão é checada na criação do gatilho, não na execução).
2. Policy `dp_doc_colab_self_read` passa a excluir `tipo = 'disciplinar'`,
   alinhando a tabela à regra já existente no Storage (`dp-disciplinar` e
   `dp_doc_bucket_read_autorizado`).
3. `dp_colaborador_of` e `dp_colaborador_ativo_of` perdem o desvio
   `auth.uid() IS NULL`; resta apenas o caminho `service_role` (fail closed).

Também registrei no histórico de migrations as versões `20260915140000`
(ficha atômica) e `20260915160000`, que estavam aplicadas sem registro.

## 4. Itens mantidos

- 225 rotinas `SECURITY DEFINER` executáveis por `authenticated` (RPCs do
  produto e helpers internos usados por policies).
- 60 avisos do `policy-sweep` (policies duplicadas por comando e
  `USING (true)` para `authenticated` em tabelas já escopadas por empresa).
- 5 tabelas internas sem GRANT para `authenticated`
  (`auth_login_identifiers`, `auth_rate_limits`, `auth_recovery_challenges`,
  `cnpj_cache`, `dp_cargos`) — intencional.
- `landing_content` e `mkt_site_settings` legíveis sem login (site público).

## 5. RLS / multiempresa

Sem regressão: 195 arquivos de teste passando (1907 casos). As suítes
`src/test/rls` e `src/test/tenancy` (50 casos) continuam auto-skipadas sem os
secrets `TEST_*` — validação real de A/B/C/D depende do CI. A validação
funcional isolada da Fase P0.4 (clone descartável, 26 grupos/27 subcasos) e a
da ficha atômica (13 grupos/74 verificações) permanecem como evidência.

## 6. Edge Functions do Pessoas (14)

`dp-alterar-senha-colaborador`, `dp-bloquear-acesso-colaborador`,
`dp-criar-acesso-colaborador`, `dp-doc-bulk-approve/discard/ingest/worker`,
`dp-ficha-registro-parse`, `dp-generate-disciplinary-pdf`,
`dp-notify-atestado`, `dp-refresh-pendencias`, `dp-reset-password`,
`dp-send-broadcast`, `dp-sorteio-folgas`.

Todas com verificação de identidade/autorização no código; `service_role`
apenas server-side; `dp-doc-bulk-worker` é o único com `verify_jwt = false`,
protegido por segredo interno em cabeçalho. `deno check` aprovado (3 falhas
herdadas em baseline, nenhuma do Pessoas). Nenhum endpoint legado do Pessoas
sem uso identificado.

## 7. Repositório / branch protection

Não é possível ler nem alterar configuração do GitHub a partir daqui. Proposta
compatível com o fluxo Lovable → GitHub: exigir os checks `CI` e
`Security Lint` em `main`, **sem** exigir Pull Request e **sem**
"Require linear history" (o Lovable empurra direto em `main`; exigir PR
quebra a sincronização). Ativar primeiro só os status checks e observar um
ciclo de sincronização.

## 8. CI / status checks

`ci.yml` roda typecheck strict, ESLint com teto, scope-lint, testes e build.
Lacunas: `migrations-check` e `deno-check` só existem no `release-gate.yml`
(disparo manual/gate) e o `security-lint.yml` exige o secret
`SUPABASE_DB_URL`, ausente hoje — sem ele o check falha e não pode ser
exigido na proteção de branch. Recomendação: cadastrar o secret e adicionar
os dois passos ao `ci.yml`.

## 9. Ambiente / segredos

`.env` versionado contém apenas as 4 chaves públicas do app
(`VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_URL`,
`VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_LOVABLE_CONNECTOR_LOGO_DEV_API_KEY`) —
necessárias ao build; não apagar. `.env.example` espelha as 4 chaves. Guard do
CI reprova qualquer variável sem prefixo `VITE_` no `.env`. Nenhum segredo em
frontend, migration, teste, log ou documentação.

## 10. Código legado

Nenhuma função, policy ou Edge Function do Pessoas ficou comprovadamente sem
uso: as 80 rotinas sem chamada direta do frontend têm referência em outras
funções, policies ou Edge Functions. Remoção de Open Finance v1 e limpeza de
policies duplicadas seguem como P2 fora desta fase.

## 11. Testes finais

| Etapa | Resultado |
| --- | --- |
| TypeScript strict | 0 erros |
| ESLint | 0 erros, 1772 warnings (teto 546 no CI — teto histórico defasado) |
| Vitest | 1907 passando, 50 skipados (RLS/tenancy sem secrets) |
| migrations-check | 678 migrations aprovadas (dry-run sem CLI) |
| deno check | aprovado (3 baseline) |
| security-lint | 0 críticos / 225 avisos |
| policy-sweep | 0 críticos / 60 avisos |
| Build | ✓ |

## 12. Rollback

```sql
-- 1) devolve EXECUTE às 35 funções de gatilho (não recomendado)
-- GRANT EXECUTE ON FUNCTION public.<nome>() TO authenticated;
-- 2) volta a policy anterior
DROP POLICY IF EXISTS dp_doc_colab_self_read ON public.dp_documentos;
CREATE POLICY dp_doc_colab_self_read ON public.dp_documentos
  FOR SELECT USING (colaborador_id IS NOT NULL
    AND colaborador_id = public.dp_colaborador_of((SELECT auth.uid())));
-- 3) restaura o desvio auth.uid() IS NULL nas duas funções (ver histórico
--    da migration 20260915160000 neste repositório)
```

## 13. Pendências de homologação (não são falhas técnicas)

1. Teste real com PDF do escritório contábil (Fase 6).
2. Teste real de liberação de acesso do colaborador (Fase 7).
3. Teste real de mensagem de RLS (Fase 9).

## 14. Parecer

O módulo Pessoas está tecnicamente fechado: 0 achados críticos, menor
privilégio aplicado às rotinas internas, isolamento multiempresa coberto por
testes e validações isoladas, Edge Functions com autorização própria. Restam
como dívidas conhecidas e não bloqueantes: teto de ESLint defasado, secret do
security-lint no CI, proteção de branch e as 3 homologações acima. Não
declaro "zero vulnerabilidades" — declaro zero achados críticos com os
avisos remanescentes justificados neste documento.
