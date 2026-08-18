# Restaurar os atalhos "Copiar o horário de..." no Horário de Trabalho + título do diálogo

## O que aconteceu

Na remoção do quadro de horário padrão, a fileira de botões com o **nome dos colegas** deixou de ser renderizada na tela de cadastro/edição do colaborador. A lógica de ordenação continua intacta no código (mesmo cargo primeiro, depois horário mais repetido na unidade, depois uso mais recente, com deduplicação da semana inteira e limite de 10 nomes) — só o trecho visual se perdeu.

Além disso, o usuário pediu que o título do diálogo deixe de ser fixo "Editar Colaborador" e passe a mostrar **"Editar: <Nome do Colaborador>"** (ou "Cadastrar: Novo Colaborador" no fluxo de criação).

## O que será feito

- Trazer de volta a fileira de atalhos logo abaixo do cabeçalho de "Horário de Trabalho por Dia", com o rótulo "Copiar o horário de:" e um botão por colega mostrando **apenas o primeiro nome** (horário completo no hover), como estava antes.
- Cada botão continua copiando a **semana completa** do colega: folgas, folga variável e os dias com entrada/saída diferentes (padrão da loja).
- Manter a regra de ordenação já existente (mesmo cargo primeiro, depois horário mais repetido, depois uso mais recente).
- Ajustar a deduplicação: colegas com **exatamente o mesmo horário** entram uma única vez, mesmo que tenham **dias de folga diferentes**. A chave de comparação passa a considerar só os horários (base + variações de entrada/saída/intervalo dos dias trabalhados), ignorando quais dias são folga.
- O botão "Copiar de Outro Colaborador" (diálogo completo) e os atalhos Grade da unidade / 6x1 / 5x2 permanecem como estão.
- Alterar o título do diálogo em `ColaboradorFormDialog.tsx` para exibir **"Editar: <Nome>"** quando houver colaborador em edição, ou **"Cadastrar: Novo Colaborador"** (ou equivalente) no cadastro.
- Conferir na tela, com o colaborador aberto, que os nomes dos colegas aparecem, que clicar em um deles traz a semana inteira e que o título do diálogo mostra o nome do colaborador.

## Detalhes técnicos

- Arquivo: `src/components/dp/ColaboradorJornadaPanel.tsx`.
- Reintroduzir a renderização de `atalhosColegas` (memo já existente, linhas ~170-196) chamando `copiarSemanaDoColega(m)` no clique.
- Arquivo: `src/components/dp/ColaboradorFormDialog.tsx`.
- Substituir o título fixo pelo título dinâmico "Editar: <nome>" / "Cadastrar: Novo Colaborador".
- Sem mudanças em `src/lib/dp/modeloHorarioRanking.ts`, `src/lib/dp/config-trabalho.ts` ou no hook `useDpModelosHorario`.
