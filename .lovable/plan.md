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

Diagnóstico complementar já feito: **PostgreSQL 17.6** (suporta `ON DELETE SET NULL (<coluna>)`); `dp_timezone_resolvido` hoje com `EXECUTE` para `anon` e `authenticated` e **nenhum consumidor** no frontend, em Edge Functions ou em outras funções do banco; todas as policies das 6 tabelas novas são apenas `SELECT` (admin/owner + leitura própria em `dp_indisponibilidades` e `dp_convocacao_descumprimentos`).

1. `CREATE OR REPLACE FUNCTION public.dp_timezone_resolvido(uuid, uuid) ... SECURITY INVOKER`, preservando assinatura, resolução unidade → empresa → NULL, sem default e sem backfill. Como não há consumidor legítimo, `REVOKE EXECUTE ... FROM anon, authenticated` (menor privilégio); isolamento cross-company passa a ser garantido pela RLS de `dp_unidades`/`companies` sob a sessão do próprio usuário.
2. FKs de substituição recriadas como compostas contra `dp_convocacoes(id, company_id)` com `ON DELETE SET NULL (substituida_por_id)` e `ON DELETE SET NULL (substitui_convocacao_id)` — apenas a coluna do ponteiro é zerada; `company_id` permanece intacto e NOT NULL. Sem CASCADE, sem trigger alternativo.
3. Descumprimentos: remover **somente** `dp_conv_descump_percentual_faixa_check`, `dp_conv_descump_percentual_regime_check` e `dp_conv_descump_percentual_analise_check`, substituindo por `dp_conv_descump_percentual_referencia_check`: `percentual_referencia IS NULL OR (percentual_referencia = 50 AND regime_snapshot = 'intermitente' AND analise = 'sem_justo_motivo' AND parte_responsavel IN ('colaborador','empregador'))`. Preservadas as constraints independentes de base/valor (`base_positiva`, `valor_analise`, `valor_base`, `valor_positivo`), o CHECK `tipo × parte_responsavel` e o de coerência da análise.
4. `REVOKE ALL ... FROM anon, authenticated` nas 6 tabelas novas e `GRANT SELECT TO authenticated` nas 6 — incluindo `dp_convocacao_eventos`, cuja leitura de auditoria fica limitada pela policy de admin/owner. Nada para `anon`. Em `dp_convocacao_eventos`, `service_role` fica restrito a `SELECT, INSERT` (append-only, sem UPDATE/DELETE/TRUNCATE); nas demais tabelas `service_role` mantém `ALL`.

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
