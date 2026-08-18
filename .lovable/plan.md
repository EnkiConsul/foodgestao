# Restaurar os atalhos "Copiar o horário de..." no Horário de Trabalho + título do diálogo

## O que aconteceu

Na remoção do quadro de horário padrão, a fileira de botões com o **nome dos colegas** deixou de ser renderizada na tela de cadastro/edição do colaborador. A lógica de ordenação continua intacta no código (mesmo cargo primeiro, depois horário mais repetido na unidade, depois uso mais recente, com deduplicação da semana inteira e limite de 10 nomes) — só o trecho visual se perdeu.

Além disso, o usuário pediu que o título do diálogo deixe de ser fixo "Editar Colaborador" e passe a mostrar **"Editar: <Nome do Colaborador>"** (ou "Cadastrar: Novo Colaborador" no fluxo de criação).

## O que será feito

- Trazer de volta a fileira de atalhos logo abaixo do cabeçalho de "Horário de Trabalho por Dia", com o rótulo "Copiar o horário de:" e um botão por colega mostrando **apenas o primeiro nome** (horário completo no hover), como estava antes.
- Cada botão continua copiando a **semana completa** do colega: folgas, folga variável e os dias com entrada/saída diferentes (padrão da loja).
- Manter a regra de ordenação e a deduplicação já existentes, sem alterar nada do motor de horários.
- O botão "Copiar de Outro Colaborador" (diálogo completo) e os atalhos Grade da unidade / 6x1 / 5x2 permanecem como estão.
- Conferir na tela, com o colaborador aberto, que os nomes aparecem e que clicar em um deles traz a semana inteira.

## Detalhes técnicos

- Arquivo: `src/components/dp/ColaboradorJornadaPanel.tsx`.
- Reintroduzir a renderização de `atalhosColegas` (memo já existente, linhas ~170-196) chamando `copiarSemanaDoColega(m)` no clique.
- Sem mudanças em `src/lib/dp/modeloHorarioRanking.ts`, `src/lib/dp/config-trabalho.ts` ou no hook `useDpModelosHorario`.
