# Cabeçalhos de tabela sem ícones encavalados

## Problema
Nas colunas estreitas (CÓD., ADMISSÃO etc.), o rótulo + seta de ordenação + ícone de filtro ficam encavalados na mesma linha, como mostra a captura enviada. Hoje `DpTableColumnHeader` sempre renderiza dois ícones (ChevronsUpDown/Arrow + Filter) com `whitespace-nowrap`, o que estoura a largura da coluna.

## Solução
Editar `src/components/dp/DpTableColumnHeader.tsx` (componente compartilhado das listas em planilha do Pessoas — férias, colaboradores, atestados etc.) sem alargar as colunas:

1. **Empilhar ícones acima do rótulo**: dentro do gatilho do cabeçalho, usar layout vertical (`flex-col`) com duas linhas:
   - Linha superior: ícones de ordenação + filtro alinhados à direita (ou centro quando `center`).
   - Linha inferior: rótulo da coluna, truncado com `truncate` e tooltip `title` mostrando o nome completo.
2. **Manter as setas sempre visíveis**: a seta de ordenação aparece em toda coluna — ativa mostra `ArrowUp`/`ArrowDown` e inativa mostra `ChevronsUpDown` sutil (`opacity-40`). O ícone de filtro aparece sempre, destacado (`text-primary`) quando há filtros ativos e sutil (`opacity-40`) quando não há.
3. **Espaçamento com a alça de resize**: adicionar `pr-2` no gatilho para o conteúdo não invadir a alça de redimensionamento da borda direita.
4. **Menu sem alterações**: itens "Ordenar Crescente/Decrescente/Padrão" e o filtro por valores continuam dentro do dropdown.
5. Ajustar o `title` do gatilho para "Clique para ordenar/filtrar · arraste para mover".

## Validação
- TypeScript (`tsgo --noEmit`).
- Playwright (1280×1800) em `/dp/ferias?aba=programacao`: screenshot do cabeçalho confirmando que CÓD., EMPREGADO e ADMISSÃO mostram ícones na linha de cima e rótulo abaixo, sem sobreposição; clicar abre o menu e a ordenação continua funcionando.
