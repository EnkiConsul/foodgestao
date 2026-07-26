## Manter a BottomNav sempre fixa

Reverter o comportamento de auto-hide da barra inferior mobile — ela ficará sempre visível, sem esconder no scroll para baixo.

### Alterações

**`src/components/mobile/MobileBottomNav.tsx`**
- Remover o hook `useHideOnScroll` (listeners de scroll + estado `hidden`).
- Remover a classe condicional `translate-y-full` do wrapper `<nav>`, mantendo a barra fixa em `bottom-0` em todas as posições de scroll.
- Manter o padding/safe-area e o restante do layout (5 slots, FAB central) inalterados.

Sem impacto em outras telas — a barra continua respeitando o `pb-` do `AppShell` para não sobrepor conteúdo.