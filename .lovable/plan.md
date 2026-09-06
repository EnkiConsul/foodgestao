# Convocação: dias selecionados com horário já preenchido

## O que muda para o gestor

Hoje, ao montar uma convocação, cada dia escolhido no calendário precisa ser aberto em um painel lateral para ver e ajustar o horário.

Passa a funcionar assim:

1. O gestor marca os dias no calendário (como hoje).
2. Logo abaixo do calendário, cada dia marcado aparece em uma linha já com **entrada e saída preenchidas** com o horário mais praticado por aquele cargo, naquela unidade, naquele dia da semana (ex.: Atendente em 06/09 → 16:30–00:35, marcado como "termina no dia seguinte").
3. O gestor só edita o que quiser: entrada, saída, "+1 dia" e vagas ficam editáveis ali mesmo, sem abrir painel.
4. Cada linha mostra de onde veio o horário: "Horário mais usado", "Horário padrão da convocação" ou "Ajustado por você".
5. Um botão "Aplicar a todos os dias" copia o horário de uma linha para os outros dias do mesmo cargo.
6. O painel lateral continua existindo, agora só para o que é detalhe fino: horário individual por pessoa naquele dia.

Quando não houver histórico daquele cargo no dia, a linha aparece marcada como "sem horário de referência — informe" e o dia não é gravado até ser preenchido (comportamento atual, apenas mais visível).

## Detalhes técnicos

Arquivo principal: `src/components/dp/convocacoes/NovaConvocacaoPlanner.tsx`.

- Extrair a lista de dias selecionados para um componente novo `src/components/dp/convocacoes/DiasSelecionadosLista.tsx`: recebe `dias` do cargo ativo, `cobertura(data, cargoId)`, `onPatch(k, patch)`, `onRemover(k)`, `onAbrirIndividuais(k)`. Campos `type="time"` para entrada/saída, checkbox `vira`, input numérico de vagas — reutilizando `patchDia`, que já marca `origem: "manual"`.
- Sugestão de horário: manter a RPC existente `dp_convocacao_necessidade_sugerida` (via `buscarNecessidadeSugerida`), sem alterar SQL. Hoje ela é chamada uma vez por clique; passar a resolver em paralelo quando vários dias são marcados e a guardar em cache local `Map<`cargo|data`, sugestão>` no componente, para que a linha já nasça preenchida e re-marcar um dia não refaça a consulta.
- Rótulo de origem derivado do campo `origem` já existente em `DiaPlanejado` (`sugerida` | `geral` | `manual`); quando `sug.ambiguo`, exibir na linha "mais de um horário praticado" em vez de depender só do toast.
- "Aplicar a todos os dias": aplica entrada/saída/vira aos dias do mesmo `cargo_id`, marcando-os como `manual`.
- Painel lateral (`Sheet`) reduzido aos overrides individuais; entrada/saída/vagas saem de lá para evitar dois lugares editando o mesmo dado.
- Persistência, validação (`diasCompletos`, `janelaMinutos`), antecedência, revisão e publicação permanecem inalteradas; nenhuma migration nova.
- Verificação: `bunx tsgo --noEmit -p tsconfig.app.json`, `bunx eslint`, `bunx vitest run src/lib/dp/__tests__` e conferência no navegador em `/dp/convocacoes` abrindo "Nova convocação" com o cargo Atendente em 06/09.
