# Operação: detalhe do dia em popout e fim da duplicação entre turnos

## Problema 1 — mesma pessoa no turno do Dia e da Noite

Em `blocosPorFuncionamento` (`src/lib/dp/operacao-panorama.ts`), uma pessoa entra em **cada** período de funcionamento que a jornada dela sobrepõe. Quem trabalha 17:00–00:35 encosta no período "Dia" (08:30–18:30) e no "Noite" (17:00–00:35), então aparece duplicada nos dois blocos.

**Correção:** cada pessoa passa a entrar em **um único** período do dia:

1. O período em que a **entrada** dela cai (ex.: 17:00 cai no "Noite").
2. Se a entrada não cair em nenhum período, ganha o período com **maior tempo de sobreposição** com a jornada.
3. Se não houver sobreposição nenhuma, a pessoa vai para o bloco "Fora do Horário de Funcionamento" (comportamento já existente).

A contagem de "pessoa(s)" de cada bloco deixa de inflar e cada nome aparece uma vez só por dia.

## Problema 2 — clique no dia da Rotina do Mês troca de aba

Hoje o clique no calendário chama `irParaDia`, que muda a data e força a aba "Rotina do Dia".

**Correção:** o clique no dia abre uma **janela popout (Dialog)** com o detalhamento daquele dia — sem sair da aba Mês:

- O conteúdo da aba "Rotina do Dia" (cards de contagem, alerta de fora do padrão com "Está ok", blocos por período agrupados por cargo, "Fora da Operação" e "Ausências Registradas") é extraído para um componente reutilizável, usado tanto na aba quanto no popout.
- O popout mostra a data no título (ex.: "sábado, 12 de setembro"), os mesmos indicadores e listas do dia escolhido, rolagem interna e botão de **fechar** (X no canto e "Fechar" no rodapé).
- No popout, as ações do dia funcionam igual: dispensar/reativar alerta, clicar num card para ver a lista da categoria, "Registrar Ausência".
- A aba "Rotina do Dia" continua existindo e navegável normalmente; o que muda é só o clique no calendário do mês.

## Detalhes técnicos

- `src/lib/dp/operacao-panorama.ts`: em `blocosPorFuncionamento`, trocar o filtro "entra em todos os períodos que sobrepõe" por uma função `melhorPeriodo(pessoa, periodos)` (entrada contida → senão maior sobreposição em minutos). Testes unitários novos em `src/lib/dp/__tests__/operacao-panorama.test.ts`: jornada 17:00–00:35 cai só no período da noite; jornada que cruza dois períodos sem entrada contida vai para o de maior sobreposição; sem sobreposição vai para "Fora do Horário".
- `src/pages/dp/DpOperacaoPanorama.tsx`: extrair o corpo da aba Dia para um componente interno (ex.: `DetalheDiaOperacao({ data })`) que reusa `dia`, `blocos`, `sociosAusentes`, cards e seções; a aba e o novo `Dialog` (estado `dataPopout: string | null`) renderizam esse componente. O `onClick` do botão do dia no calendário passa a `setDataPopout(d.data)` em vez de `irParaDia`.
- Os links de data na lista "Dias Para Avaliar" também abrem o popout (mesmo componente), em vez de trocar de aba.
- Validação: typecheck (`bunx tsgo --noEmit -p tsconfig.app.json`), lint, `bunx vitest run src/lib/dp/__tests__` e conferência visual com Playwright em `/dp/escalas/mes?aba=mes` (clicar num dia, verificar popout e que ninguém aparece em dois períodos).

## Fora de escopo

- Mudanças em banco de dados, RPCs ou nas regras de contagem (`contarDia`).
- Alterar o portal do colaborador ou a tela de folgas.
