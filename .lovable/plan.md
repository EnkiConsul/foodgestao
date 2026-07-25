
# Plano — Nova Navegação Mobile 360°FOOD

Padrão inspirado no iFood Gestor: **BottomNav de 5 slots com FAB central elevado**, **Sheet "Mais"** para itens secundários, **switcher de módulo** no header e **Hub** como centro de gravidade. Escalável para CRM, RH e Pedidos sem refatoração.

## Anatomia da tela mobile

```text
┌─────────────────────────────────────┐
│ [☰] [DP 360° ▾]         [🔔] [👤]  │  Header (56px)
├─────────────────────────────────────┤
│                                     │
│         Conteúdo da rota            │
│                                     │
│                                     │
├─────────────────────────────────────┤
│  🏠      📋     ⊕     ✓      ⋯     │  BottomNav (64px + safe-area)
│ Início Colab.  FAB  Aprov.  Mais   │
└─────────────────────────────────────┘
             ↑
      FAB elevado -20px,
      cor primária, 56×56,
      ação primária do módulo
```

## 1. Configuração declarativa por módulo

Criar `src/config/mobileNav.ts` com um objeto por módulo. Adicionar módulo novo = adicionar entrada nova, zero mudança em componentes.

```ts
type MobileNavConfig = {
  bottom: [NavSlot, NavSlot, FabSlot, NavSlot, MoreSlot];
  moreGroups: { label: string; items: NavItem[] }[];
};

export const MOBILE_NAV: Record<Module, MobileNavConfig> = {
  financeiro: {
    bottom: [
      { icon: Home, label: "Início", to: "/dashboard" },
      { icon: List, label: "Lançamentos", to: "/lancamentos" },
      { type: "fab", icon: Plus, label: "Novo", action: "new-transaction" },
      { icon: Wallet, label: "Contas", to: "/contas" },
      { type: "more" },
    ],
    moreGroups: [
      { label: "Operar", items: [Transferências, Cartões, Recorrências] },
      { label: "Cadastros", items: [Categorias, Contatos, Métodos] },
      { label: "Relatórios", items: [Fluxo, DRE, Orçamento] },
      { label: "Conta", items: [Empresa, Plano, Configurações, Sair] },
    ],
  },
  dp: {
    bottom: [
      { icon: Home, label: "Início", to: "/dp" },
      { icon: Users, label: "Colab.", to: "/dp/colaboradores" },
      { type: "fab", icon: Plus, label: "Novo", action: "new-dp" },
      { icon: CheckSquare, label: "Aprov.", to: "/dp/aprovacoes" },
      { type: "more" },
    ],
    moreGroups: [ /* Folha, Documentos, Cadastros, Relatórios, Conta */ ],
  },
  // Futuro: crm, rh, pedidos — mesmo shape
};
```

## 2. Componentes novos

- `src/components/mobile/MobileBottomNav.tsx` — 5 slots, slot central renderiza `MobileFab`, item ativo com `translate-y-[-2px]` + cor primária.
- `src/components/mobile/MobileFab.tsx` — Botão 56×56 elevado (`-mt-6`), sombra, cor primária, ícone `Plus`. Ao clicar dispara ação do módulo (abrir dialog de novo lançamento / nova solicitação / etc). Ação registrada num `MobileFabProvider`.
- `src/components/mobile/MobileMoreSheet.tsx` — `Sheet` full-height que abre de baixo, mostra grupos em cards, cada item com `min-h-11`. Header do sheet tem "Acompanhar módulos → Hub".
- `src/components/mobile/MobileHeader.tsx` — Header enxuto (56px): `SidebarTrigger` esquerdo (só desktop), **ModuleSwitcher chip** ("DP 360° ▾") centro-esquerda, notificações + avatar à direita.
- `src/components/mobile/ModuleSwitcherChip.tsx` — Chip com nome do módulo ativo; ao tocar abre `Popover`/`Sheet` pequeno listando módulos disponíveis da empresa (Financeiro, DP, futuros). 1 toque para trocar. Também tem "Voltar ao Hub".
- `src/providers/MobileFabProvider.tsx` — Context que permite cada página registrar/sobrescrever a ação do FAB (ex.: em `/lancamentos` o FAB abre modal de novo lançamento; em `/contas` abre nova conta).

## 3. Portal do colaborador (simplificado)

Config própria com **4 slots + FAB** (sem "Mais"):

```ts
portalColaborador: {
  bottom: [
    { icon: Home, label: "Início", to: "/dp/meu" },
    { icon: Calendar, label: "Calendário", to: "/dp/meu/calendario" },
    { type: "fab", icon: Plus, label: "Solicitar", action: "new-solicitacao" },
    { icon: Inbox, label: "Solicitações", to: "/dp/meu/solicitacoes" },
    { icon: User, label: "Perfil", to: "/dp/meu/perfil" },
  ],
}
```

Sem Sheet "Mais". Documentos e Trocas acessados por dentro do Início/Perfil. Header do portal não tem module switcher (colaborador vê só o portal dele).

## 4. Integração com o app existente

- `src/components/layout/AppLayout.tsx` (ou equivalente): substituir `BottomNav.tsx` atual pelo novo `MobileBottomNav`. Envolver com `MobileFabProvider`.
- Header mobile atual (que hoje tem hamburger à esquerda) recebe o novo `MobileHeader` com o `ModuleSwitcherChip`.
- Sidebar desktop existente **permanece intocada** — plano é mobile-only. Em `md:` para cima, `MobileBottomNav` some (`md:hidden`) e a sidebar volta.
- Rota de "Hub" (`/`) permanece como está; o switcher chip e o botão dentro do Sheet Mais levam pra ela.
- Deletar `src/components/layout/BottomNav.tsx` antigo depois que o novo estiver plugado.

## 5. Ações do FAB por rota

Cada página relevante registra sua ação via `useMobileFab({ label, onPress })`:

- `/lancamentos` → abre `LancamentoDialog` novo
- `/dashboard` (financeiro) → mesma ação
- `/contas` → abre `ContaDialog`
- `/dp` e `/dp/colaboradores` → abre menu rápido (Novo colaborador / Nova folha / Novo comunicado)
- `/dp/aprovacoes` → some (não faz sentido criar aqui) — FAB desregistrado
- Portal `/dp/meu/*` → abre `NovaSolicitacaoDialog`

Se a página não registra ação, FAB **não é renderizado** e o slot central vira espaço vazio (grid ajusta pra 4 itens equidistantes).

## 6. Acessibilidade e ergonomia

- Todos os alvos ≥ 44×44 (WCAG).
- Safe-area: `pb-[env(safe-area-inset-bottom)]` no BottomNav.
- FAB `aria-label` dinâmico ("Novo lançamento", "Nova solicitação").
- `role="tablist"` na BottomNav; item ativo com `aria-current="page"`.
- Sheet "Mais" fecha com swipe-down (padrão shadcn) e tem foco inicial no primeiro item.

## 7. Escalabilidade (CRM/RH/Pedidos)

Ao adicionar CRM:
1. Adicionar `crm:` em `MOBILE_NAV`
2. Adicionar CRM ao `ModuleSwitcherChip`
3. Registrar ações de FAB nas páginas novas via `useMobileFab`

Zero refactor em `MobileBottomNav`, `MobileFab`, `MobileMoreSheet`, `MobileHeader`.

## 8. Validação

Playwright em 375×812, 414×896, 768×1024:
- Fluxo Financeiro: Início → FAB → novo lançamento → Contas → Mais → Cadastros
- Fluxo DP admin: DP → FAB → Aprovações → Mais → Relatórios
- Fluxo Portal colaborador: Início → Calendário → FAB → nova solicitação → Perfil
- Switcher: DP → chip → Financeiro (1 toque)
- Zero overflow horizontal, zero erros de console

## Escopo fora deste plano

- Push notifications, gestos avançados (swipe entre abas), personalização pelo usuário dos 4 slots — fica para uma fase futura se surgir demanda.
- Sidebar desktop, layouts `md:` e acima permanecem exatamente como estão hoje.
