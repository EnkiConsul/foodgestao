# Corrigir logo duplicado no header da sidebar

No `SidebarHeader` de `src/components/layout/AppSidebar.tsx` hoje renderiza dois elementos que representam a marca:

1. `<Logo variant="icon" />` — PNG do app icon que já contém "360" desenhado
2. Texto `"360°" + "FOOD"`

Visualmente aparece como duas logos lado a lado.

**Correção**: remover o `<Logo variant="icon" />` e manter só o wordmark "360°FOOD" (laranja + branco). Quando a sidebar estiver colapsada (`collapsed = true`), mostrar apenas "360°" em negrito laranja como marca compacta.

Nenhuma mudança em outros arquivos, tokens, rotas ou lógica.
