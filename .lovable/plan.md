
# Padronização de Layout — Sidebar contextual por módulo

Unificar todo o sistema no mesmo esqueleto do `AppLayout` (sidebar à esquerda + header + main), com o **conteúdo da sidebar mudando conforme o módulo ativo**. Nada de nova paleta, nova tipografia ou novo design — apenas reorganização estrutural preservando 100% dos tokens 360°FOOD (laranja `#EB6119` + marinho `#0F1B3D`).

## O que muda de layout

| Área | Hoje | Depois |
|---|---|---|
| Financeiro (`/dashboard`, `/lancamentos`, …) | AppSidebar com tudo | AppSidebar com **só menu Financeiro** + grupo Conta |
| DP admin (`/dp/*`) | Barra horizontal `DpLayout` | AppSidebar com **menu DP agrupado** + grupo Conta |
| Portal Colaborador (`/dp/meu/*`) | Header minimalista `ColaboradorShell` | AppSidebar com **menu do colaborador** + grupo Conta |
| CRM/RH/Pedidos (placeholders) | AppLayout, sem menu próprio | AppSidebar preparada para receber menu próprio quando o módulo for construído |
| Hub `/hub` | AppSidebar completa | AppSidebar **só com o item "Hub de Módulos"** (limpa, para escolher módulo) |

## Estrutura da nova sidebar

```text
┌─ Logo 360°FOOD ────────────┐
│ ⌂ Hub de Módulos           │  ← sempre presente (voltar)
├────────────────────────────┤
│ [MÓDULO ATIVO]             │  ← "Financeiro 360°" | "DP 360°" | "Portal"
│   Item 1                    │
│   Item 2                    │
│   ▸ Subgrupo (collapsible)  │
├────────────────────────────┤
│ CONTA                       │  ← fixo em todos os módulos
│   Empresas                  │
│   Usuários                  │
│   Meu Plano                 │
│   Minhas Faturas            │
│   Configurações             │
│   Backoffice (super-admin)  │
├────────────────────────────┤
│ Suporte · Sair              │  ← footer
└────────────────────────────┘
```

## Menu por módulo

**Financeiro 360°** (mantém o que já existe):
- Dashboard · Lançamentos · Fluxo de Caixa · Orçamento · Relatórios (Financeiros / Contábeis) · Contas Bancárias · Formas de Pagamento · Clientes/Fornecedores · Categorias · Contas Contábeis

**DP 360°** (migrado da barra horizontal, agrupado):
- Início
- **Operação** (collapsible): Colaboradores, Folgas, Trocas, Solicitações, Aprovações
- **Comunicação** (collapsible): Avisos, Mensagens
- **Compliance** (collapsible): Disciplinar, Bloqueios, Documentos
- **Folha** (collapsible): Períodos, Aprovações Financeiro
- **Cadastros** (collapsible): Unidades, Cargos, Sindicatos, Negociações

**Portal do Colaborador** (`/dp/meu/*`):
- Início · Meus dados · Documentos · Solicitações · Trocas
- (grupo Conta reduzido: só Configurações + Sair; sem Empresas/Usuários/Planos)

## Como o menu troca

Novo hook `useActiveModule()` (em `src/hooks/useActiveModule.tsx`) que detecta o módulo pela rota:
- `/hub` → `hub` (sidebar mínima)
- `/dp/meu/*` → `portal_colaborador`
- `/dp/*` → `dp`
- `/crm/*` → `crm` · `/rh/*` → `rh` · `/pedidos/*` → `pedidos`
- resto (`/dashboard`, `/lancamentos`, `/relatorios`, …) → `financeiro`

`AppSidebar` lê esse hook e renderiza o bloco de menu correspondente (um componente por módulo em `src/components/layout/sidebar-menus/`: `FinanceiroMenu.tsx`, `DpMenu.tsx`, `PortalMenu.tsx`, `CrmMenu.tsx`, `RhMenu.tsx`, `PedidosMenu.tsx`, `HubMenu.tsx`). Grupo "Conta" e footer são compartilhados.

## Arquivos afetados

**Novos:**
- `src/hooks/useActiveModule.tsx`
- `src/components/layout/sidebar-menus/FinanceiroMenu.tsx`
- `src/components/layout/sidebar-menus/DpMenu.tsx`
- `src/components/layout/sidebar-menus/PortalMenu.tsx`
- `src/components/layout/sidebar-menus/CrmMenu.tsx`, `RhMenu.tsx`, `PedidosMenu.tsx`, `HubMenu.tsx`
- `src/components/layout/sidebar-menus/AccountMenu.tsx` (grupo Conta reusável)

**Modificados:**
- `src/components/layout/AppSidebar.tsx` — passa a delegar o bloco central ao menu do módulo ativo.
- `src/components/dp/DpLayout.tsx` — vira `<Outlet />` puro (o menu horizontal some; guard PJ + sino de notificações vão para o `AppHeader` como área contextual do DP).
- `src/components/dp/ColaboradorShell.tsx` — vira thin wrapper que reutiliza o `AppLayout`, mantendo o gate de `is_dp_colaborador`.
- `src/App.tsx` — `/dp/meu/*` passa a usar o `AppLayout` normal (com Portal ativo detectado pela rota); rota `/dp/*` também.
- `src/pages/Hub.tsx` — sem mudanças de conteúdo; só se beneficia da sidebar mais limpa.

**Removido:**
- Barra horizontal do DP (código inline em `DpLayout.tsx`).
- Header próprio do `ColaboradorShell.tsx` (substituído pelo `AppHeader`).

## Preservado (não muda)

- Todos os tokens de cor em `index.css` e `tailwind.config.ts`.
- Logo, header, breadcrumbs, bottom nav mobile, install prompt.
- Rotas atuais e permissões (ModuleGuard continua envolvendo `/dp`, `/crm` etc.).
- Sino de notificações do DP (`DpNotificacoesBell`) — passa a viver no `AppHeader` quando módulo ativo = DP.
- Comportamento `collapsible="icon"`, hover `translate-x-1`, subgrupos collapsible, ativação por `NavLink`.

## Validação final

- `tsgo --noEmit` limpo.
- Navegar por Hub → Financeiro → DP → Portal → Hub e confirmar que a sidebar troca corretamente em cada rota.
- Portal do colaborador: verificar que grupo Conta aparece reduzido (só Configurações/Sair).
- Super-admin: item Backoffice continua aparecendo no grupo Conta.
