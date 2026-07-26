## Problema

Ao segurar (long-press) um atalho na BottomNav mobile, o Chrome Android abre seu **menu de contexto nativo** ("Copiar endereço do link", "Baixar link", "Compartilhar link", "Abrir no navegador Chrome"…) em vez de — ou junto com — o nosso `ShortcutCustomizer`.

Causa: os slots da BottomNav são renderizados como `<a>`/`Link` do react-router. No Android, um toque longo em link dispara o menu de contexto do sistema por padrão, e o callback JS de long-press não consegue impedir isso a tempo.

## Correção

Ajustar **apenas** `src/components/mobile/MobileBottomNav.tsx` para desativar o menu de contexto nativo nos slots customizáveis, sem alterar navegação nem lógica de sincronização:

1. Nos elementos dos slots A, B e C (Hub):
   - Adicionar `onContextMenu={(e) => e.preventDefault()}`
   - Adicionar as CSS properties `WebkitTouchCallout: 'none'` e `WebkitUserSelect: 'none'` (Tailwind: `[-webkit-touch-callout:none] select-none`)
   - Adicionar o atributo HTML `draggable={false}`
2. Se o slot for renderizado como `<Link>`, trocar por `<button>` + `navigate()` **apenas** nos slots que suportam long-press, para eliminar de vez o gatilho do menu nativo do Chrome em links. Slots fixos (Hub, FAB) permanecem como estão.
3. Manter o comportamento atual: tap curto navega, long-press (~500ms) abre o `ShortcutCustomizer`.

## Detalhes técnicos

- `onContextMenu` cobre desktop (clique direito) e a maioria dos Androids.
- `-webkit-touch-callout: none` é o que efetivamente suprime o "peek menu" no Chrome/Safari mobile em elementos que são âncoras.
- `user-select: none` evita a seleção de texto que às vezes aparece junto.
- `draggable={false}` remove o gesto de arrastar link no Android.
- Nenhuma alteração em rotas, hooks (`useModuleShortcut`, `useDpUserPrefs`) ou banco.

## Fora de escopo

- Não mexer no `ShortcutCustomizer`, na sincronização dos atalhos ou nos slots fixos (Hub central e FAB).
- Não alterar comportamento desktop.