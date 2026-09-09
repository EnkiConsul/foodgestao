# Rotina do Dia: esconder cards zerados

Na Rotina do Dia (e na janela do dia aberta pelo calendário do mês), os cards com valor **0** passam a ficar ocultos por padrão, em desktop e no celular. Um botão com ícone de olho ao lado da grade mostra ou esconde os zerados, e a escolha fica salva para o próximo acesso.

## Como vai funcionar

- Só aparecem os cards com valor maior que zero (ex.: Fixos Escalados 5, Folga Padrão 1).
- Acima da grade, à direita, um botão discreto: "Mostrar zerados (10)" com ícone de olho; ao clicar, todos voltam a aparecer e o botão vira "Ocultar zerados" com o ícone de olho cortado.
- A preferência é lembrada no navegador do gestor, junto das preferências que já existem para esta tela.
- Se todos os cards estiverem zerados (dia sem ninguém), a grade mostra uma linha curta explicando que nada há para o dia, com o mesmo botão para revelar os cards.
- A ordem personalizada dos cards por arrastar continua funcionando; ao mostrar os zerados eles voltam nas posições originais.
- A Rotina do Mês continua igual (são 4 indicadores fixos e informativos).

## Detalhes técnicos

Arquivo: `src/pages/dp/DpOperacaoPanorama.tsx`

- `GradeCards` recebe duas props novas opcionais: `valores?: Record<string, number>` e `ocultarZerados?: boolean`. Quando ambas estiverem presentes, a grade filtra a lista `ordem` mantendo apenas chaves com valor `> 0`; o `SortableContext` recebe a lista filtrada para o drag continuar coerente.
- `GradeCards` ganha um cabeçalho opcional (`acao?: React.ReactNode`) para o botão de olho, ou o botão fica no chamador acima da grade — o botão usa `Eye`/`EyeOff` do lucide, `variant="ghost" size="sm"`.
- `DetalheDiaOperacao` calcula um mapa de valores por chave de card reaproveitando a lógica atual do `render`: `dia.contagens[cat]`, `dia.contagens_avulsos.teste/folguista` e `sociosAusentes.length`.
- Estado `mostrarZerados` no componente pai (`DpOperacaoPanorama`) persistido em `localStorage` sob nova chave `operacao_cards_zerados`, seguindo o padrão já usado por `PREFS_KEY`/`AGRUP_KEY`; passado para `DetalheDiaOperacao` nas duas chamadas (aba do dia e diálogo do dia do calendário).
- Nenhuma mudança em dados, hooks ou consultas — apenas apresentação.
