# Simplificar Rotina: aposentar as telas de Escala

## Contexto (respondendo à dúvida)

Na operação da Pakerê a escala já está definida sem nenhuma geração:

- jornada habitual por dia da semana, cadastrada em cada colaborador (inclusive horários diferentes Seg-Qui / Sex-Dom);
- folga semanal do cadastro + folgas dominicais e extras marcadas no calendário;
- intermitentes entram pelas convocações aceitas.

O sistema já resolve o horário previsto nesta ordem: convocação aceita > escala publicada > rascunho > jornada habitual. Sem escala publicada, Operação do Dia, cobertura mínima, Minha Escala (portal) e a calculadora de VA/VT usam a jornada habitual e descontam folgas, férias e atestados. Ou seja, nada depende da geração da escala.

O que só a Escala do Mês oferece hoje: snapshot congelado do turno por dia, alteração de horário de um dia isolado sem mexer no cadastro, validação em lote de carga/DSR antes de publicar e o ato de "publicar" o mês. Esses ganhos são pequenos no seu caso, e exceções de um dia já são resolvidas por folga extra ou convocação.

## O que será feito

1. Ocultar as entradas "Escala do Mês" e "Gerar Escala" do menu Rotina e dos atalhos/favoritos, usando o mecanismo de telas ocultas já existente (reversível a qualquer momento pelo painel de Super Admin).
2. Manter as rotas e o código intactos, para não perder nada caso a operação mude (rodízio de turnos, nova unidade com escala variável).
3. Manter os dados já publicados: nenhum registro de escala é apagado, e a prioridade de horário previsto continua respeitando escalas publicadas existentes.
4. Deixar a Operação do Dia como ponto de entrada do grupo Rotina, reforçando que ela monta o dia a partir de jornada + folgas + convocações.

## Detalhes técnicos

- `src/config/dpNavigation.tsx`: remover/ocultar os itens `/dp/escalas/mes` e `/dp/escalas` do grupo Rotina e ajustar os prefixos de rota do grupo.
- `src/config/favoritablePages.ts`: retirar as duas telas da lista de páginas favoritáveis.
- Registrar as telas como ocultas em `app_hidden_screens`, de modo que o Super Admin possa reexibi-las em `/admin/telas` com um clique.
- Sem migração de banco e sem alteração em `useDpHorarioPrevisto`, `useDpValeCalculadora` ou `dp_escala_itens`.

## Fora de escopo

- Excluir definitivamente as telas e as tabelas de escala.
- Alterar convocações, calendário de folgas ou Operação do Dia.
