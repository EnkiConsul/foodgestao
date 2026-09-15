# P0.4 — Pessoas 360°: rotinas internas fechadas e titularidade blindada

Escopo cirúrgico. Nenhuma mudança de UI, de regra de negócio ou de RLS além da
policy de `companies` citada. Nenhum dado de cliente alterado; nenhuma geração
de escala/folgas executada em produção.

## 1. Inventário e decisão

| Rotina | Chamadores reais | Decisão |
| --- | --- | --- |
| `dp_bulk_increment_processed(uuid)` | apenas outras rotinas da fila de importação | interna: `service_role` |
| `dp_escala_auto_gerar(uuid, date)` | `dp_escala_auto_gerar_todas` (cron) | interna: `service_role` |
| `dp_escala_auto_gerar_todas()` | cron | interna: `service_role` |
| `dp_folga_autoatribuir_todas()` | cron | interna: `service_role` |
| `dp_folga_autoatribuir_competencia(uuid,uuid,date)` | rotinas internas | interna: `service_role` |
| `dp_folga_autoatribuir_manual(uuid,uuid,date)` | rotinas internas | interna: `service_role` |
| `dp_folga_autoatribuicao_previa(uuid,uuid,date)` | rotinas internas | interna: `service_role` |
| `dp_escala_item_validar_setor()` | trigger | interna: `service_role` |
| `dp_folgas_validar_unificado()` | trigger | interna: `service_role` |
| `dp_folga_autoatribuicao_plano(uuid,uuid,date)` | `src/pages/dp/DpFolgas.tsx` | mantida para usuário logado — já exige `private.is_company_admin_or_owner(auth.uid(), _company)` |
| `dp_folga_autoatribuir_aplicar(uuid,uuid,date,jsonb)` | `src/pages/dp/DpFolgas.tsx` | idem |

Busca de chamadores feita em `src/`, `supabase/functions/`, `scripts/` e `e2e/`.
As rotinas internas continuam sendo chamadas por outras funções `SECURITY
DEFINER` (privilégio do dono), portanto cron e Edge seguem funcionando sem
`EXECUTE` para `authenticated`.

## 2. Titularidade da empresa

Além dos triggers `BEFORE UPDATE` já existentes
(`companies_guard_owner_transfer`, `dp_guard_company_owner_transfer`,
`prevent_company_ownership_transfer`), a policy de atualização de `companies`
passou a exigir, no `WITH CHECK`, que `user_id` permaneça igual ao dono atual —
exceto se o solicitante for o próprio dono ou super admin. O dono atual é lido
por `private.company_owner_snapshot(uuid)` (`SECURITY DEFINER`, `STABLE`,
`search_path` explícito), sem `EXECUTE` para `anon`.

## 3. Arquivos

- `supabase/migrations/20260915024500_p04_pessoas_internal_functions_and_owner_transfer.sql`
  (idempotente; só permissões, uma função auxiliar e a policy; verificação
  fail-closed no fim aborta se alguma interna voltar a ficar aberta).
  Registrada no controle de migrações do banco
  (`supabase_migrations.schema_migrations`, versão `20260915024500`) junto com as
  migrações P0/P0.2-A/P0.2-B/P0.2-C/P0.3, que também estavam apenas aplicadas
  como DDL e versionadas em arquivo.
- `src/test/rls/dp_internal_functions.rls.test.ts` — validação de privilégios por
  **leitura do catálogo** (`pg_proc`, `aclexplode`, `pg_trigger`, `pg_policies`)
  via `psql`. Não chama nenhuma rotina de negócio — em especial nenhuma global
  mutante (`dp_escala_auto_gerar_todas`, `dp_folga_autoatribuir_todas`), que
  gravaria dados reais em caso de regressão de permissão. Sem banco disponível os
  casos aparecem como **skipped** (`describe.skipIf`), nunca como aprovados.
- `supabase/tests/dp_internal_functions_p04.test.sql` — cenários com **fixtures
  sintéticas** (usuários e empresa criados no próprio script), papel
  `authenticated` real via `SET ROLE` + claims JWT, tudo em transação revertida.
  Nenhuma empresa real é usada.

### Cobertura dos testes

Vitest (26 casos, aprovados neste ambiente):

- as 9 internas sem `EXECUTE` para `anon`, `authenticated` e `PUBLIC`, com
  `service_role` preservado;
- as 9 internas ainda `SECURITY DEFINER` com `search_path` explícito;
- os 2 gatilhos que usam `dp_escala_item_validar_setor` e
  `dp_folgas_validar_unificado` continuam anexados e habilitados;
- cadeia interna preservada (`..._todas` chama a rotina por empresa/competência);
- os 2 endpoints legítimos com `EXECUTE` para `authenticated`/`service_role`,
  negados para `anon`, e com checagem de admin/dono no corpo da função;
- `WITH CHECK` da policy de `companies` referenciando
  `private.company_owner_snapshot` e `is_super_admin`.

SQL com fixtures (T1–T8) — **cobertura pretendida, ainda não executada**
(exige banco isolado de teste/CI; ver Limitações): privilégios e PUBLIC; gatilhos
ativos; endpoints legítimos; **positivos** — admin não-dono edita campos comuns,
dono edita e transfere titularidade; **negativos** — admin não-dono não assume
titularidade, usuário sem vínculo não altera nada. O cenário **T7 pretende
isolar o mérito da policy**: com os três gatilhos de titularidade temporariamente
desabilitados dentro da transação, espera-se que o `UPDATE` do admin falhe com
`SQLSTATE 42501` (violação de RLS) e que o dono permaneça o mesmo; T7b espera
que, nessa mesma condição, a edição comum do admin continue funcionando.

Rigor das asserções negativas (T6 e T8): o bloco de captura contém apenas o
`UPDATE`; o papel é restaurado antes da leitura verificadora; o titular/nome
final é conferido com `IS DISTINCT FROM` (NULL não passa como aprovação); e só é
aceita a negação esperada — `42501`, zero linhas afetadas sem erro, ou, no T6,
`P0001` com a mensagem exata de um dos três gatilhos existentes. Qualquer outro
`SQLSTATE`/mensagem faz o cenário falhar.


## 4. Validação executada

| Verificação | Resultado |
| --- | --- |
| `bunx vitest run src/test/rls/dp_internal_functions.rls.test.ts` | 26 aprovados, 0 falhas (exit 0) |
| `bunx vitest run src/test/rls src/test/tenancy` | ver seção de execução no fechamento da fase |
| `node scripts/migrations-check.mjs` | aprovado |
| `node scripts/security-lint.mjs --ci` | 0 críticos |
| `node scripts/policy-sweep.mjs` | 0 críticos |
| `bunx tsgo --noEmit` | sem erros |
| `bunx vite build` | ok |
| `supabase_migrations.schema_migrations` | versão `20260915024500` registrada |
| `supabase/tests/dp_internal_functions_p04.test.sql` | **não executado neste ambiente** |

## 5. Limitações (sem alegação de aprovação)

- O script SQL com fixtures **não roda neste ambiente**: o papel do sandbox
  (`sandbox_exec`) não tem `INSERT` em `auth.users`, não pode assumir
  `authenticated` nem desabilitar gatilhos. Ele exige conexão com papel
  proprietário no CI. Os cenários T1–T3 (privilégios/gatilhos/endpoints) estão
  cobertos e aprovados pelo teste Vitest; T4–T8 (fixtures de titularidade) ficam
  **pendentes de execução** até haver `SUPABASE_DB_URL` com papel dono.
- Os agendamentos (`cron`) não são legíveis por este ambiente; a preservação da
  execução interna foi provada por privilégio de `service_role`, pelos gatilhos
  ativos e pela cadeia `SECURITY DEFINER` — nenhuma geração de escala/folgas foi
  executada em produção.
- As demais correções da auditoria (outros domínios) seguem fora desta etapa.

