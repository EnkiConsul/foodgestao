# Caixa de seleção sempre visível na Conciliação

Na tabela de conciliação (desktop) a primeira coluna é a caixa de seleção (checkbox) da linha, e a tabela rola horizontalmente (`overflow-x-auto`, verificado em `src/pages/ConciliacaoPluggy.tsx`). Ao rolar para a direita para chegar em "Forma de pagamento" ou "Fornecedor / cliente", a coluna do checkbox sai da tela e o usuário perde a referência de qual linha está marcando.

## O que muda

- A coluna da caixa de seleção passa a ficar fixa (congelada) na borda esquerda da tabela: ao rolar horizontalmente, os checkboxes — o do cabeçalho (selecionar todos) e o de cada linha — continuam visíveis.
- A coluna fixa recebe fundo próprio (cabeçalho com o tom do cabeçalho, linhas com o fundo do card e o mesmo destaque quando a linha está selecionada/realçada) e uma linha divisória à direita, para que o conteúdo que passa por baixo não apareça sobreposto.
- O checkbox do cabeçalho continua fixo também na vertical, já que o cabeçalho da tabela mantém o comportamento atual.
- Nenhuma mudança no mobile (cards) nem na lógica de seleção, filtros ou conciliação.

## Detalhes técnicos

- Arquivo único: `src/pages/ConciliacaoPluggy.tsx`.
- No `<th>` da coluna de seleção e no `<td>` correspondente de cada linha: adicionar `sticky left-0 z-10` (z acima das células normais e abaixo do cabeçalho sticky), `bg-*` semântico correspondente ao contexto (`bg-muted/40` no header, fundo da linha no corpo) e `border-r` para separar visualmente.
- Como a cor de fundo da linha varia (linha realçada/selecionada), a classe de fundo da célula fixa é derivada do mesmo estado que já controla o `<tr>`, via `cn(...)`, usando apenas tokens do design system — sem cores fixas.
