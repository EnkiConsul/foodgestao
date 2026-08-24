# Convocações — Fase 3A.1.1 (Hardening pós-implementação)

Diagnóstico já executado contra o banco real. Nada da 3A.1 será revertido, editado ou recriado; toda correção entra em **uma nova migration incremental**.

## Diagnóstico (evidências coletadas agora)

| Item | Estado real | Ação |
|---|---|---|
| `dp_timezone_resolvido(_company_id uuid, _unidade_id uuid)` | `prosecdef = true` (**SECURITY DEFINER**), `search_path=public` | corrigir → INVOKER |
| `dp_convocacoes.substituida_por_id` | `fk_dp_convocacoes_substituida_por` → `dp_convocacoes(id)` (**FK simples**) | corrigir → composta |
| `dp_convocacoes.substitui_convocacao_id` | `fk_dp_convocacoes_substitui` → `dp_convocacoes(id)` (**FK simples**) | corrigir → composta |
| Dados de substituição cross-company | 0 linhas em `dp_convocacoes` (tabela vazia); 0 pares cross-company | seguro alterar |
| `dp_conv_descump_percentual_faixa_check` | permite qualquer valor 0–100 (aceita 40/60) | corrigir → travar em 50 para a regra CLT |
| `dp_conv_descump_percentual_regime_check` | exige `regime_snapshot='intermitente' AND parte_responsavel='colaborador'` | corrigir → permitir também `empregador` (cancelamento após aceite); freelancer segue proibido |
| Grants efetivos (`relacl`) das 6 tabelas novas | `anon=arwdDxtm` e `authenticated=arwdDxtm` (**ALL**) — divergente do desenho RPC-only | corrigir com REVOKE |
| RLS | ativa (`relrowsecurity=true`) em todas as 6 tabelas + `dp_convocacoes`; políticas presentes (1–3 por tabela) | apenas documentar matriz |
| Enum `dp_convocacao_status` | conferir valores; sem `compareceu`/`ausente` (comparecimento vive em colunas próprias, já com CHECKs) | nenhuma alteração |
| `dp_regime_convocavel(dp_regime_trabalho)` / `dp_convocacao_guard` | funções existem; guard `SECURITY DEFINER` usando a função central | apenas validar |
| Migrations GitHub × Cloud | 13 arquivos da 3A.1 (`20260824014101` … `20260824015602`) presentes no repo **e** registrados no Cloud, mesma ordem; sem divergência | apenas relatar |
| Dia útil / feriados | regra seg–sex mantida | fora de escopo |

Observação: os grants amplos em `anon`/`authenticated` são o achado mais sério (P0 de superfície). A correção será restrita às tabelas criadas na 3A.1 — nenhuma tabela DP legada será tocada.

## Correção — migration única `convocacoes_3a1_1_hardening`

1. `CREATE OR REPLACE FUNCTION public.dp_timezone_resolvido(uuid, uuid) ... SECURITY INVOKER` preservando assinatura, resolução unidade → empresa → NULL, sem default e sem backfill.
2. `DROP CONSTRAINT` + `ADD CONSTRAINT` das duas FKs de substituição como compostas contra `dp_convocacoes(id, company_id)`, mantendo `ON DELETE SET NULL` (sem CASCADE).
3. Descumprimentos: substituir os dois CHECKs de percentual por um único CHECK que exige, quando `percentual_referencia IS NOT NULL`: `= 50`, `regime_snapshot = 'intermitente'`, `analise = 'sem_justo_motivo'` e `parte_responsavel IN ('colaborador','empregador')` (coerente com `tipo` já validado). `valor_referencia` continua dependente de base + percentual.
4. `REVOKE ALL ... FROM anon, authenticated` nas 6 tabelas novas; reconceder somente `SELECT` a `authenticated` onde a leitura é necessária pela UI/RLS (`dp_convocacao_grupos`, `dp_convocacao_ocorrencias`, `dp_convocacao_config`, `dp_indisponibilidades`, `dp_convocacao_descumprimentos`) e nenhum privilégio a `anon`. `dp_convocacao_eventos`: sem grant a `authenticated` (append-only via RPC). `service_role` mantém `ALL`.

Se algum passo falhar, **PARO** e diagnostico antes de qualquer conserto.

## Validações após aplicar

- Timezone: unidade → empresa → NULL, timezone inválido rejeitado, e teste cross-company com sessão autenticada real (não `service_role`).
- Testes negativos multiempresa (transação com `ROLLBACK`, sem deixar dado artificial): grupo A × unidade B, ocorrência A × cargo/turno B, convocação A × colaborador/ocorrência B, `substituida_por_id`/`substitui_convocacao_id` A → B, evento A × ocorrência B, descumprimento A × convocação B.
- Descumprimento: 50% colaborador (ok), 40% e 60% (rejeitados), justificado + 50% (rejeitado), freelancer + 50% (rejeitado), cancelamento do empregador + 50% (ok).
- Grants: reconsulta de `information_schema.role_table_grants` e `relacl` por tabela/role.
- RLS: matriz efetiva por tabela a partir de `pg_policies`.
- Legado: criação pela tela atual, aceite/recusa no Portal, cancelamento, prazo e sincronização por `dp_convocacao_sync_escala` (único mecanismo, preservado).
- Projeto: `npx tsgo`/typecheck, `npx eslint .` (contagem antes × depois), `npx vite build` (exit code) e `npm test`. Deno check: não aplicável (nenhuma Edge Function alterada).
- Tipos: regenerar/verificar `src/integrations/supabase/types.ts` e informar se houve mudança material (esperado: nenhuma, pois só mudam constraints, grants e SECURITY mode).

## Arquivos

- `supabase/migrations/<novo timestamp>_convocacoes_3a1_1_hardening.sql` (novo)
- `src/integrations/supabase/types.ts` apenas se a regeneração mudar algo

Nenhuma alteração de UX; `useDpConvocacoes.tsx` permanece com a desambiguação de FK. `DpConvocacoes.tsx`, `DpMinhasConvocacoes.tsx`, `DpMeuCalendario.tsx`, `operacao-panorama.ts`, `escala-mes.ts`, `horario-previsto.ts` e `va-calculo.ts` não serão tocados.

## Rollback

Documentado apenas para a 3A.1.1: reverter SECURITY mode, restaurar as FKs simples, restaurar os CHECKs antigos e reconceder os grants. Marcado explicitamente: **o rollback reabre falha P0 de multiempresa e de exposição de grants — tecnicamente possível, inseguro em produção, exige decisão explícita.**

Ao concluir: entrega no formato dos 24 itens do item 28 e **PARADA**, sem iniciar a 3B.
