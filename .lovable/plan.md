# Cabeçalhos de tabela sem ícones encavalados

## Problema
Nas colunas estreitas (CÓD., ADMISSÃO etc.), o rótulo + seta de ordenação + ícone de filtro ficam encavalados, como mostra a captura enviada. Hoje `DpTableColumnHeader` sempre renderiza dois ícones (ChevronsUpDown/Arrow + Filter) com `whitespace-nowrap`, o que estoura a largura da coluna.

## Solução
Editar `src/components/dp/DpTableColumnHeader.tsx` (componente compartilhado das listas em planilha do Pessoas — férias, colaboradores, atestados etc.) sem alargar as colunas:

1. **Um só ícone por padrão**: o ícone permanente passa a ser o funil (filtro), pois o menu que ele abre já contém a ordenação. A seta de ordenação só aparece **quando a coluna é a ordenação ativa** (`sortAtivo`), substituindo o ChevronsUpDown solto.
2. **Rótulo truncado**: trocar `whitespace-nowrap` por `truncate` (com `title` tooltip mostrando o nome completo), de modo que o texto ceda espaço em vez de empurrar os ícones.
3. **Espaçamento com a alça de resize**: adicionar `pr-2` no gatilho para o conteúdo não invadir a alça de redimensionamento da borda direita.
4. **Menu sem alterações**: itens "Ordenar Crescente/Decrescente/Padrão" e o filtro por valores continuam dentro do dropdown.
5. Ajustar o `title` do gatilho para "Clique para ordenar/filtrar · arraste para mover".

## Validação
- TypeScript (`tsgo --noEmit`).
- Playwright (1280×1800) em `/dp/ferias?aba=programacao`: screenshot do cabeçalho confirmando que CÓD., EMPREGADO e ADMISSÃO mostram rótulo + um único ícone sem sobreposição; clicar abre o menu e a ordenação continua funcionando.
