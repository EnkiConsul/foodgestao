# Ajustes visuais no Início mobile e card de aniversariantes

## O que vamos fazer

1. **Atalhos dos menus principais no mobile**
   - Trocar o card atual (`MenusPrincipaisCards.tsx`) por uma grade de ícones compactos.
   - Cada item mostra apenas o ícone do menu centralizado e o nome do menu em letra menor logo abaixo.
   - Remove a aparência de card (borda, fundo, padding grande) para ficar menos poluído.
   - Mantém a ordem personalizada do menu e os links para os hubs.

2. **Card de aniversariantes**
   - No item de cada aniversariante, o nome (`toUpperCadastro(a.nome)`) deve ocupar melhor a linha disponível.
   - Remove o `truncate` quando houver espaço; usa `break-words` ou `whitespace-normal` com tamanho de fonte proporcional.
   - Preserva o layout quando o nome for muito longo (mobile estreito) para não empurrar os botões de ação.

## Arquivos envolvidos
- `src/components/dp/home/MenusPrincipaisCards.tsx`
- `src/components/dp/home/AniversariantesCard.tsx`

## Como validar
- Visualizar o Início no mobile: atalhos dos menus devem aparecer como ícones + rótulos pequenos, sem cards.
- Verificar o card de aniversariantes: nomes como "ERILDSON S..." devem usar o espaço da linha ao invés de truncar prematuramente.
