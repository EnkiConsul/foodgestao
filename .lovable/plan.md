## Ajustes /mais mobile + Personalizador BottomNav — Plano Consolidado

### 1. Header do módulo (linha do nome + Buscar) — `MoreHeader.tsx` + `Mais.tsx`
- Manter **duas linhas fixas** empilhadas ao rolar:
  - Linha 1 (`sticky top-0`): topbar global com nome da empresa + sino.
  - Linha 2 (`sticky top-14`): nome do módulo à esquerda + campo Buscar à direita.
- **Nome do módulo** fica fixo no topo (não repete no corpo da página).
- **Campo Buscar compacto**: substituir `flex-1 max-w-[200px]` por `w-[116px] shrink-0`, com `pl-8 pr-2 h-9 text-sm`, lupa em `left-2.5`, placeholder apenas "Buscar" (sem "Funcionalidade").
- Nenhum card "Acompanhar módulos" no corpo — a função Hub já vive na BottomNav.

### 2. Corpo de /mais — subgrupos sem cabeçalho redundante — `Mais.tsx` + `MoreGroupSection.tsx`
- **Não renderizar** o cabeçalho do grupo raiz do módulo ("DP 360°", "Financeiro 360°" etc.) — o nome do módulo já está fixo no topo.
- **Não** mostrar chevron/opção de ocultar o módulo inteiro.
- Manter **chevron de colapso somente por menu/subgrupo** (Cadastro, Folgas, Documentos, Comunicação, etc.) — cada subgrupo continua expansível/colapsável.
- Clicar no nome/ícone de um subgrupo continua navegando para o hub correspondente.
- Rodapé com nome do usuário e nível de acesso permanece.

### 3. Tiles — sem quebra no meio de palavras — `MoreGroupSection.tsx` (~linha 281)
- Trocar `break-words hyphens-auto` por `break-normal [overflow-wrap:normal] hyphens-none whitespace-normal`.
- Aplicar `text-[11px] tracking-tight leading-[1.15]` para folga em coluna de ~110 px do grid 3-cols.
- Palavras únicas ("Contracheques", "Adiantamentos") ficam em 1 linha; rótulos compostos podem ir para até 2 linhas apenas entre palavras.

### 4. Estrela de favorito colada ao ícone — `MoreGroupSection.tsx` (~linhas 270–288)
- Mover `<Star>` para dentro do `<span>` circular do ícone (chip recebe `relative`).
- Posição: `absolute -top-0.5 -right-0.5 h-3.5 w-3.5 fill-primary text-primary ring-2 ring-background rounded-full`.
- Resultado: estrela parcialmente sobreposta ao canto superior direito do ícone, com halo de fundo para destacar do chip colorido.

### 5. Favoritos sincronizados com o desktop — `useFavoriteNavItems.ts`
- Confirmar que a fonte é `dp_user_prefs.extras.favoritos_paginas` via `useDpUserPrefs` (mesma origem do menu lateral desktop), com fallback `localStorage` apenas offline.
- Long-press em um tile alterna favorito nessa mesma lista — reflete no desktop imediatamente.

### 6. Personalizar os DOIS atalhos (2º e 4º slots) — `MobileBottomNav.tsx` + `Mais.tsx`
Contexto: BottomNav é `[Hub · Atalho A(2º) · Início(3º) · Atalho B(4º) · Mais]`. O 3º slot (Início) é fixo. Hoje o botão "Personalizar Barra" só abre o slot A.
- Adicionar `Tabs` no `SheetContent` do customizer com **"Atalho esquerdo (2º slot)"** e **"Atalho direito (4º slot)"**.
- `customizerSlot` alterna entre `"a"` e `"b"` conforme a aba; lista de opções e `currentTo` recalculam.
- Long-press em cada slot da barra abre direto na aba correspondente.
- Em `Mais.tsx`, botão "Personalizar Barra" abre o sheet na aba A por padrão (usuário troca para B dentro do sheet).
- Rótulo "Personalizar Barra" continua em Title Case; subtítulo dinâmico segue a aba.

### Fora do escopo
- Nada muda em hooks de dados, grid, layout do Hub, ou lógica das rotas.