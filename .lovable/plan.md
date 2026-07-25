
# Polish Premium da Navegação Mobile — 360°FOOD

Complementa a reformulação da BottomNav (5 slots: Hub · Início · FAB · Ação-chave · Mais) já aprovada, elevando o acabamento visual/tátil ao nível de iFood/Nubank/Stone.

## Escopo

### 1. Notch curvado premium no FAB
Substituir o retângulo atual da `MobileBottomNav` por uma barra desenhada em SVG com recorte côncavo ao redor do FAB.

- Novo componente `src/components/mobile/BottomNavShape.tsx` que renderiza um `<svg>` full-width com `<path>` desenhando: canto arredondado → curva Bézier descendo/subindo ao redor do FAB (raio ~34px, profundidade ~22px) → canto arredondado.
- Fundo do path usa `hsl(var(--card))` com `filter: drop-shadow(0 -4px 12px hsl(var(--foreground)/0.08))` para elevação suave superior.
- FAB fica posicionado com `-translate-y-6` sobre o notch, com anel externo `ring-4 ring-background` para "encaixar" visualmente no recorte.
- Antes de codar, chamar `design--create_directions` com screenshot da barra atual para validar 3 variantes (curva profunda vs suave, com/sem highlight interno, cor sólida vs gradient sutil laranja→marinho) e perguntar ao usuário via `ask_questions` type=prototype.

### 2. Sheet "Mais" com busca + favoritos
Refatorar `src/components/mobile/MobileMoreSheet.tsx`:

- **Busca**: `Input` sticky no topo do Sheet com ícone `Search`, filtrando itens de todos os grupos em tempo real (match no `label` normalizado, sem acento).
- **Favoritos**: nova seção "⭐ Favoritos" no topo (acima dos grupos), populada por `useFavoriteNavItems()` — novo hook em `src/hooks/useFavoriteNavItems.ts` persistindo em `localStorage` chave `360food:mobile-fav-nav:v1` (máx 6 itens).
- **Long-press** (600ms via `onTouchStart`/`onTouchEnd` timer) em qualquer item do Sheet → toggle favorito + toast "Adicionado aos favoritos" / "Removido". Ícone `Star` (preenchido quando favorito) aparece no canto direito do item.
- Estado vazio da busca: "Nenhum item encontrado" com ícone `SearchX`.

### 3. Micro-interações e haptics
- Ao trocar de aba na `MobileBottomNav`: `navigator.vibrate?.(8)` (guard para browsers sem suporte).
- Indicador de aba ativa animado com `motion/react` (spring, stiffness 380, damping 30) deslizando entre slots — barrinha superior de 3px com `bg-primary` e `rounded-full`.
- FAB: `whileTap={{ scale: 0.92 }}` + vibração de 12ms ao abrir action sheet.
- Itens do Sheet "Mais": `active:scale-[0.97] transition-transform` para feedback tátil visual.

## Arquivos afetados

- **Novos**: `src/components/mobile/BottomNavShape.tsx`, `src/hooks/useFavoriteNavItems.ts`.
- **Editados**: `src/components/mobile/MobileBottomNav.tsx` (integra shape + indicador motion + haptics), `src/components/mobile/MobileFab.tsx` (whileTap + vibrate), `src/components/mobile/MobileMoreSheet.tsx` (busca + favoritos + long-press).
- **Sem mudanças**: `src/config/mobileNav.tsx`, providers, rotas — a configuração declarativa por módulo continua a mesma.

## Detalhes técnicos

- `motion/react` já instalado no projeto (usado no Sidebar); reutilizar.
- SVG do notch é responsivo via `preserveAspectRatio="none"` + `viewBox` calculado a partir da largura do container (`useMeasure` ou `ResizeObserver` simples).
- Haptics é progressive-enhancement: `if ('vibrate' in navigator) navigator.vibrate(ms)`.
- Favoritos são globais (não por módulo) — usuário pode fixar "Lançar entrada", "Bater ponto", "Contas" juntos.
- Tokens semânticos apenas (`--primary`, `--card`, `--foreground`) — nada hardcoded.

## Ordem de execução

1. `design--create_directions` para o notch (screenshot da barra atual) → `ask_questions` prototype → aguardar escolha.
2. Implementar `BottomNavShape` + integrar em `MobileBottomNav` com indicador motion e haptics.
3. Criar `useFavoriteNavItems` + refatorar `MobileMoreSheet` com busca, favoritos e long-press.
4. Ajustes finais no `MobileFab` (whileTap + vibrate).
5. Validar em Playwright mobile (375px e 407px) — screenshots do notch, sheet aberto com busca, favoritos após long-press.
