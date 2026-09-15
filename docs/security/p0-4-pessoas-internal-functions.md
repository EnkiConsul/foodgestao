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
- `src/test/rls/dp_internal_functions.rls.test.ts` — anon e usuário logado
  bloqueados nas 9 internas; app-facing negadas para visitante.
- `supabase/tests/dp_internal_functions_p04.test.sql` — transação com `ROLLBACK`:
  privilégios das internas, preservação de `service_role`, preservação das
  app-facing e bloqueio de troca de titularidade por admin não-dono.

## 4. Evidências

Privilégios após a migração (`has_function_privilege`): as 9 internas com
`anon = false`, `authenticated = false`, `service_role = true`; as 2 app-facing
com `authenticated = true`.

Teste em transação revertida com a identidade de um administrador não-dono: o
`UPDATE` de `companies.user_id` não persistiu (bloqueio confirmado) e a
transação terminou em rollback intencional — nenhum dado alterado.

Verificações executadas: `node scripts/migrations-check.mjs`,
`node scripts/security-lint.mjs --ci`, `node scripts/policy-sweep.mjs`,
`bunx vitest run src/test/rls src/test/tenancy`, `bunx tsgo --noEmit`,
`bunx vite build`.

## 5. Limitações

- Os agendamentos (`cron`) não são legíveis por este ambiente; a preservação da
  execução interna foi provada por privilégio de `service_role` e pela cadeia
  `SECURITY DEFINER`, não por execução real da geração de escala/folgas (que
  seria uma operação de negócio em produção e por isso não foi executada).
- As demais correções da auditoria (outros domínios) seguem fora desta etapa.
