## Unificar "Relatórios" e "Relatórios Contábeis" em um único item de menu

### Objetivo
Transformar os dois itens separados do menu lateral em **um único item pai "Relatórios"** que expande/recolhe mostrando dois subitens. Nenhuma rota, página, hook ou regra de negócio será alterada — mudança **exclusivamente de navegação**.

### Estrutura final do menu
```
Relatórios            (pai — só expande/recolhe, ícone BarChart3)
  ├─ Financeiros      → /relatorios
  └─ Contábeis        → /relatorios/contabeis
```

### Alterações
Único arquivo modificado: `src/components/layout/AppSidebar.tsx`

1. Remover os dois itens de menu independentes ("Relatórios" e "Relatórios Contábeis") da lista atual.
2. Adicionar um bloco de submenu usando os componentes já disponíveis do shadcn sidebar (`SidebarMenuSub`, `SidebarMenuSubItem`, `SidebarMenuSubButton`) dentro de um `Collapsible`:
   - Botão pai: label "Relatórios", ícone atual, **sem `NavLink`** (apenas toggle do collapsible — não navega).
   - Chevron rotaciona ao abrir.
   - Subitens: "Financeiros" (→ `/relatorios`) e "Contábeis" (→ `/relatorios/contabeis`), ambos com `NavLink` e `isActive` baseado em `useLocation`.
3. Estado inicial: submenu **aberto por padrão quando a rota atual começa com `/relatorios`**, para manter contexto visual.
4. Modo colapsado (sidebar em `icon`): mostrar apenas o ícone pai; ao expandir volta o submenu (comportamento nativo do shadcn sidebar).
5. Preservar o padrão visual já usado (translate-x-1 no hover/active, cores do design system).

### O que NÃO muda
- Rotas em `src/App.tsx` continuam idênticas (`/relatorios` e `/relatorios/contabeis`).
- Páginas, componentes de relatório, hooks, RPCs, permissões, filtros por URL — nada é tocado.
- Ordem geral dos itens do sidebar permanece a mesma (o novo pai ocupa a posição do antigo "Relatórios").
