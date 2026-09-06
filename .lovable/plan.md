# Folgas: remarcar e cancelar qualquer folga marcada, sem fantasma no calendário

## Diagnóstico (confirmado no código)

O calendário de Pessoas > Folgas mistura folgas de **duas origens diferentes**:

1. **Pedidos aprovados** (`dp_solicitacoes`, ex.: Sara 12/09, Hanna 19/09) — aprovar um pedido só muda o status do pedido; **não cria registro de folga**.
2. **Folgas efetivadas** (`dp_folgas`, criadas pela atribuição manual ou pela distribuição automática).

Hoje o botão **"Gerenciar"** (remarcar/cancelar) só aparece para a origem 2. Resultado:

- Folga vinda de pedido aprovado **não tem como remarcar nem cancelar** no calendário.
- Quando as duas origens existem juntas (pedido aprovado + folga efetivada no mesmo dia), cancelar a folga efetivada **não some com o nome** — o pedido aprovado continua desenhando o dia no calendário.

## O que vou fazer

**1. "Gerenciar" em toda folga marcada.** No detalhe do dia, toda folga aprovada/marcada passa a ter o botão "Gerenciar" — tanto a que veio de pedido aprovado quanto a efetivada. (A "Folga Semanal" fixa do cadastro continua sem Gerenciar, pois se muda no cadastro de trabalho.)

**2. Cancelar sem deixar fantasma.** Ao cancelar:
- a folga efetivada é marcada como cancelada (histórico preservado, como hoje), e
- o pedido aprovado correspondente (mesma pessoa e data), se existir, também é marcado como cancelado, com a justificativa do gestor visível para o colaborador.

Como as duas consultas do calendário já ignoram registros cancelados, **o nome da pessoa some do dia** imediatamente.

**3. Remarcar nos dois lados.** Remarcar atualiza a data da folga efetivada e, se houver pedido aprovado correspondente, também a data do pedido — tudo na mesma janela "Gerenciar folga" que já existe.

**4. Portal do colaborador.** O dia cancelado some também do calendário do colaborador (que já ignora canceladas) e o pedido aparece como "Cancelada" em Minhas Solicitações, com a justificativa.

## Detalhes técnicos

- Arquivo principal: `src/pages/dp/DpFolgas.tsx` — o evento do calendário passa a carregar a origem (`folga:` + id do pedido quando houver); `cancelarFolga` e `remarcarFolga` viram operações em duas etapas (folga efetivada + pedido correspondente) numa função auxiliar em `src/lib/dp/folga-gerenciar.ts`, sem `as any`.
- Busca do pedido correspondente: `dp_solicitacoes` com `tipo = folga`, `status = aprovada`, mesmo `colaborador_id` e `data_alvo` cobrindo a data.
- Cancelamento do pedido usa o status `cancelada` (já existe no sistema) com `resposta_admin` = justificativa do gestor.
- Sem migração de banco: as consultas já filtram canceladas e o enum já tem o status.
- Testes: unitários da função auxiliar (cancela os dois lados, remarca os dois lados, sem pedido correspondente) + verificação na tela com Playwright (cancelar a folga de um dia e conferir que o nome some do calendário).
- Validação: typecheck, lint e vitest antes de entregar.
