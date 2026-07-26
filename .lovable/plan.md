## Duas correções no header de /mais

### 1. Fixar a linha do módulo logo abaixo da topbar

Hoje `MoreHeader` usa `sticky top-0`, mesmo `top` que a topbar (`AppHeader`, `h-14`). Isso faz a linha do módulo "colidir" com a topbar quando o conteúdo rola. Solução:

- Em `src/components/mobile/MoreHeader.tsx`, trocar a classe `sticky top-0 z-20` por `sticky top-14 z-20` (56 px = altura da `AppHeader`). Assim as duas linhas ficam empilhadas e fixas: topbar (empresa + sino) no topo, header do módulo logo abaixo.
- `z-20` continua abaixo do `z-40` da topbar, evitando sobreposição visual.

### 2. Voltar com input "Buscar" persistente

O usuário quer o formato anterior — um campo de busca visível, só com texto **"Buscar"** em vez do antigo "Buscar funcionalidade..." — não o botão lupa que expande.

Alterações em `MoreHeader`:

- Remover o toggle `expanded` e o botão-lupa.
- Renderizar sempre um `<Input>` compacto na mesma linha do título:
  - Título (`DP 360°`) à esquerda, sem `flex-1` para não roubar espaço.
  - Input com `flex-1 max-w-[200px]` alinhado à direita, `h-9 rounded-xl`, ícone `Search` prefixado, `X` sufixado quando houver texto, placeholder **"Buscar"**.
- Manter a propagação de `query`/`onQueryChange` para `Mais.tsx` (nada muda no consumidor).

### Arquivos alterados

- `src/components/mobile/MoreHeader.tsx` — sticky `top-14` e input "Buscar" sempre visível na mesma linha do título.

Nenhuma alteração em `Mais.tsx`, rotas, ou config.
