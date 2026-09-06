# Operação: popout do dia, fim da duplicação de turnos e folgas aprovadas

## Problema 1 — mesma pessoa no turno do Dia e da Noite

Em `blocosPorFuncionamento` (`src/lib/dp/operacao-panorama.ts`), uma pessoa entra em **cada** período de funcionamento que a jornada dela sobrepõe. Quem trabalha 17:00–00:35 encosta no período "Dia" (08:30–18:30) e no "Noite" (17:00–00:35), então aparece duplicada nos dois blocos.

**Correção:** cada pessoa passa a entrar em **um único** período do dia:

1. O período em que a **entrada** dela cai (ex.: 17:00 cai no "Noite").
2. Se a entrada não cair em nenhum período, ganha o período com **maior tempo de sobreposição** com a jornada.
3. Se não houver sobreposição nenhuma, a pessoa vai para o bloco "Fora do Horário de Funcionamento" (comportamento já existente).

A contagem de "pessoa(s)" de cada bloco deixa de inflar e cada nome aparece uma vez só por dia.

## Problema 2 — clique no dia da Rotina do Mês troca de aba

Hoje o clique no calendário chama `irParaDia`, que muda a data e força a aba "Rotina do Dia".

**Correção:** o clique no dia abre uma **janela popout** com o detalhamento daquele dia — sem sair da aba Mês:

- O conteúdo da aba "Rotina do Dia" (cards de contagem, alerta de fora do padrão com "Está ok", blocos por período agrupados por cargo, "Fora da Operação" e "Ausências Registradas") é extraído para um componente reutilizável, usado tanto na aba quanto no popout.
- O popout mostra a data no título (ex.: "sábado, 12 de setembro"), os mesmos indicadores e listas do dia escolhido, rolagem interna e botão de **fechar** (X no canto e "Fechar" no rodapé).
- No popout as ações do dia funcionam igual: dispensar/reativar alerta e clicar num card para ver a lista da categoria.
- A aba "Rotina do Dia" continua existindo e navegável normalmente; o que muda é só o clique no calendário do mês.

## Problema 3 — folga aprovada da Rosângela (06/09) aparece como escalada

Confirmado no banco: a folga da Rosângela em 06/09 é um **pedido aprovado** (em `dp_solicitacoes`, tipo folga, status aprovada), e não uma folga efetivada em `dp_folgas`. O painel da operação lê apenas `dp_folgas`, então esse dia é contado como jornada normal e a pessoa aparece escalada. As folgas aprovadas da Sara (12/09), Hanna (19/09) e Cristiane (20/09) estão na mesma situação.

**Correção:** o painel passa a considerar também os pedidos de folga aprovados como folga do dia — mesma regra já usada no calendário de folgas. Pedidos cancelados ou recusados continuam ignorados. Assim o dia 06/09 mostra a Rosângela em "Folga Padrão" e fora do quadro escalado, e os números dos cards e do calendário do mês passam a bater com o calendário de folgas.

## Detalhes técnicos

- `src/lib/dp/operacao-panorama.ts`: em `blocosPorFuncionamento`, trocar o filtro "entra em todos os períodos que sobrepõe" por `melhorPeriodo(pessoa, periodos)` (entrada contida → senão maior sobreposição em minutos). Testes unitários novos em `src/lib/dp/__tests__/operacao-panorama.test.ts`: jornada 17:00–00:35 cai só no período da noite; jornada que cruza dois períodos sem entrada contida vai para o de maior sobreposição; sem sobreposição vai para "Fora do Horário".
- `src/hooks/useDpOperacaoPanorama.tsx`: nova consulta a `dp_solicitacoes` com `tipo = 'folga'` e `status = 'aprovada'` na janela carregada; os registros entram no array `folgas` como `{ tipo: 'normal' }` (deduplicado por colaborador+data contra `dp_folgas`). A prioridade de `contarDia` (férias > atestado > folga extra > folga padrão > trabalho) não muda.
- `src/pages/dp/DpOperacaoPanorama.tsx`: extrair o corpo da aba Dia para um componente interno (ex.: `DetalheDiaOperacao({ data })`) reusando `dia`, `blocos`, `sociosAusentes`, cards e seções; a aba e o novo `Dialog` (estado `dataPopout: string | null`) renderizam esse componente. O `onClick` do dia no calendário e os links de "Dias Para Avaliar" passam a `setDataPopout(d.data)` em vez de `irParaDia`.
- Validação: typecheck (`bunx tsgo --noEmit -p tsconfig.app.json`), lint, `bunx vitest run src/lib/dp/__tests__` e conferência com Playwright em `/dp/escalas/mes?aba=mes` (abrir o dia 06/09 no popout e confirmar a Rosângela em folga, sem duplicação entre Dia e Noite).

## Fora de escopo

- Mudanças de banco de dados ou nas regras de contagem de `contarDia`.
- Alterar o portal do colaborador ou a tela de folgas.
