# Histórico: Quebra De Linha Correta E Colunas Redimensionáveis

## O que muda

1. **Quebra de linha só onde faz sentido**
   - **Tipo** e **Unidade**: quebram em várias linhas (é o comportamento desejado).
   - **Colaborador**: passa a ficar em uma linha, com corte por reticências e nome completo no tooltip (deixa de quebrar).
   - **Competência** e **Aceite**: continuam em uma linha.
   - Se o usuário estreitar demais uma coluna, o texto quebra naturalmente dentro da largura escolhida.

2. **Usuário controla a largura de cada coluna**
   - Alça de arraste na borda direita de cada cabeçalho: arrastar para a esquerda/direita ajusta a largura, com feedback visual durante o arraste.
   - Largura mínima por coluna (80px) para nunca sumir o título.
   - Duplo clique na alça devolve a coluna à largura padrão.
   - As larguras escolhidas ficam salvas no navegador, por usuário, junto com a ordem das colunas já existente.
   - O arraste de largura não dispara o menu de ordenar/filtrar nem o arraste de reordenação da coluna.

3. **Sem rolagem lateral por padrão**
   - As larguras padrão continuam somando a largura da tela. Se o usuário alargar colunas além do espaço disponível, a tabela passa a permitir rolagem horizontal — é uma escolha dele, não o padrão.

## Detalhes técnicos

- `src/pages/dp/DpHistoricoCompleto.tsx`
  - Trocar `width` em classe Tailwind (`w-[26%]`) por larguras numéricas em px no descritor `COLS`, com estado `colWidths: Record<ColKey, number>` e persistência em `localStorage` (chave nova, versionada).
  - `Table` mantém `table-fixed`; aplicar `style={{ width }}` no `TableHead` e um `<colgroup>` não é necessário com `table-fixed` + larguras no header.
  - Wrapper com `overflow-x-auto` e `min-width` calculado pela soma das larguras, para acomodar alargamento manual.
  - `cellClass` por coluna: `colaborador` → `truncate` + `title`; `tipo`/`unidade` → `whitespace-normal break-words`.
- `ColunaFiltroHeader`: receber `width: number`, `onResize(delta)` e `onResetWidth`; renderizar a alça (`div` absoluta, `cursor-col-resize`) com handlers `pointerdown/move/up`, chamando `stopPropagation` e desabilitando `draggable` enquanto redimensiona.
- Mobile (cards) não é afetado.
