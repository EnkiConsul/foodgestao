
## Problema

Hoje o cálculo de bloqueio só consulta `dp_datas_bloqueadas` (datas materializadas). As **regras cadastradas em `dp_bloqueio_regras`** (fixa anual, dinâmica ordinal-por-mês, pós-pagamento, etc.) só valem se o admin apertar "Regenerar próximos 12 meses" em `/dp/bloqueios`. Se esquecer, ou se a data pedida cair fora dos 12 meses, o calendário do colaborador, o formulário de solicitação e o trigger `dp_folgas_validar_self` **não bloqueiam** — apesar da regra estar ativa.

7 regras ativas em produção dependem hoje dessa materialização (Dia dos Pais, Dia das Mães, Pós-pagamento FDS>dia 5, Namorados, Crianças, véspera de Natal, véspera de Ano Novo).

## Objetivo

Regra cadastrada = regra valendo. Sem botão, sem materialização manual. `dp_bloqueio_regras` passa a ser fonte de verdade direta, avaliada em runtime no frontend e no banco. **Todas as duas fontes de bloqueio permanecem ativas em paralelo.**

## Fontes de bloqueio (todas valem, todas são somadas)

1. **`dp_datas_bloqueadas`** — bloqueios com validade real, incluindo:
   - lançamentos pontuais criados manualmente pelo admin (sem `regra_id`);
   - datas já materializadas de regras (com `regra_id`), que continuam bloqueando normalmente;
   - a coluna `liberada_por_solicitacao` continua liberando individualmente e tem prioridade máxima.
2. **`dp_bloqueio_regras`** (novo) — avaliadas em runtime, sem depender de materialização.

O bloqueio efetivo do dia = união das duas fontes, com `liberada_por_solicitacao` sobrescrevendo.

## Preservação dos dados existentes

- Nenhum registro de `dp_bloqueio_regras`, `dp_bloqueio_regra_unidades` ou `dp_datas_bloqueadas` será apagado ou alterado.
- Regras existentes continuam ativas; datas materializadas continuam bloqueando.
- CRUD de regras e de datas pontuais permanece funcionando na página.

## Escopo da correção

**1. Avaliador único de regra → data (`src/lib/dp/bloqueio-rules.ts`, novo)**
- `expandRegraNoIntervalo(regra, from, to)` → `Set<YYYY-MM-DD>`.
- Cobre os 3 tipos em produção:
  - `fixa_anual` (`regra_json.dias[] × meses[]`)
  - `dinamica` com `ordinal + dia_semana` (ex.: 2º domingo de maio)
  - `dinamica` com `tipo_original: "pos_pagamento"` (fim de semana após dia 5 nos meses listados)
- Respeita `aplicacao` (anual vs. `ano_referencia`) e `ativo`.

**2. Frontend — somar as duas fontes**
- `src/pages/dp/portal/DpMeuCalendario.tsx`, `src/pages/dp/portal/DpMeuSolicitacoes.tsx` e `src/pages/dp/DpAdminCalendario.tsx`:
  - Continuar carregando `dp_datas_bloqueadas` como hoje.
  - Carregar também `dp_bloqueio_regras` ativas + `dp_bloqueio_regra_unidades` da empresa, expandir para os meses visíveis, filtrar pela unidade do colaborador.
  - `manualBlocked` = união(datas_bloqueadas, expansão de regras). `liberada_por_solicitacao` continua sobrescrevendo.

**3. Backend — SQL**
- Nova função `public.dp_regra_bloqueia_data(_company_id uuid, _unidade_id uuid, _data date) returns boolean` `SECURITY DEFINER`.
- Triggers `dp_folgas_validar_self` e `dp_solicitacoes_validar`:
  - mantêm a checagem atual em `dp_datas_bloqueadas`,
  - somam a checagem via `dp_regra_bloqueia_data` para barrar quando qualquer regra ativa cobre o dia (bypass de admin e liberação individual mantidos).

**4. `/dp/bloqueios` — remover apenas o botão "Regenerar 12 meses"**
- Excluir o botão da UI (`DpBloqueios.tsx`), a função `regenerar12`, o estado `reprocessando` e o helper `gerarDatasParaRegra`.
- Não mexer em regras, vínculos por unidade, nem em `dp_datas_bloqueadas`.
- Aviso curto na aba de regras: "Regras valem assim que forem cadastradas."

## Fora de escopo

- Sem alterações no visual do calendário nem no formato dos toasts.
- Sem novos tipos de regra além dos 3 já existentes.
- Sem exclusão de qualquer dado.

## Detalhes técnicos

- Espelho TS (`bloqueio-rules.ts`) e função SQL com semântica idêntica para evitar “bloqueado ao salvar mas verde no calendário”.
- Testes unitários para os 3 tipos de regra em `src/lib/dp/__tests__/bloqueio-rules.test.ts`.
