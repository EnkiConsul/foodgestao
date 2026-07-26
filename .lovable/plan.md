## Objetivo

Barra inferior fixa estilo iFood Gestor visível em **todas** as rotas mobile do sistema, com layout consistente:

```
[ Hub ] [ Início ] [ + FAB ] [ Atalho ] [ Mais ]
```

- **Hub** (fixo, esq.) → `/hub`. Ativo quando `pathname === "/hub"`.
- **Início** (fixo) → home do módulo atual (Financeiro → `/dashboard`; DP → `/dp`; Portal → `/dp/meu`; Admin → `/admin/estatisticas`; Hub → `/hub` mesmo).
- **FAB (+)** (fixo, centro, elevado com notch) → ação primária do módulo (registrada por página via `useMobileFab`; fallback do módulo em `MOBILE_NAV`).
- **Atalho customizável** (1 slot) → o usuário escolhe qual funcionalidade do módulo fica ali. Padrão por módulo definido; persistido em `localStorage` por usuário/módulo.
- **Mais** (fixo, dir.) → abre o `MobileMoreSheet` com busca, favoritos e todos os itens do módulo.

## Correções e mudanças

### 1. Fazer a barra aparecer em todas as rotas
Hoje a barra só é montada em `AppLayout`. O DP usa `DpShell` próprio, e Hub/Admin estão excluídos por `MODULES_WITHOUT_BOTTOM_NAV`.

- `src/components/mobile/MobileBottomNav.tsx`: remover o `if (MODULES_WITHOUT_BOTTOM_NAV.includes(...)) return null` — barra passa a aparecer em qualquer módulo.
- `src/config/mobileNav.tsx`:
  - Remover / esvaziar `MODULES_WITHOUT_BOTTOM_NAV`.
  - Adicionar entradas `MOBILE_NAV.hub` e `MOBILE_NAV.admin` (com seus próprios slots e grupos do "Mais").
- `src/components/dp/DpShell.tsx`: envolver com `MobileFabProvider` e montar `<MobileBottomNav />`; adicionar `pb-24 md:pb-8` no `<main>` para o conteúdo não ficar coberto.
- Verificar outros shells que possam existir (busca por `SidebarProvider` em `src/components/**`) e aplicar o mesmo tratamento se houver.

### 2. Padronizar os 5 slots por módulo

Refatorar `MOBILE_NAV` para o formato de 5 slots com semântica fixa:

```ts
type ModuleNav = {
  hubTo: "/hub";
  homeTo: string;              // Início do módulo
  fab: NavFab;                 // ação primária + fallbackTo
  defaultShortcut: NavLeaf;    // atalho padrão do módulo
  shortcutOptions: NavLeaf[];  // opções elegíveis para o slot customizável
  moreGroups: MoreGroup[];     // conteúdo do sheet "Mais"
};
```

Configuração inicial por módulo:

| Módulo | Início | FAB | Atalho padrão | Opções de atalho |
| --- | --- | --- | --- | --- |
| Financeiro | /dashboard | Novo lançamento (/lancamentos?new=1) | Lançamentos | Lançamentos, Cartões, Contas, Fluxo Caixa, Relatórios, Categorias |
| DP | /dp | Novo colaborador | Colaboradores | Colaboradores, Solicitações, Aprovações, Folgas, Documentos, Comunicação |
| Portal | /dp/meu | Nova solicitação | Meu Calendário | Meu Calendário, Meus Documentos, Meu Histórico, Trocas, Perfil |
| Hub | /hub | (sem FAB — usa placeholder oculto) | Todos módulos | — |
| Admin | /admin/estatisticas | (sem FAB) | Cadastros | Cadastros, Assinaturas, Faturas, Cupons, Bancos, Auditoria, SEO |
| Conta | /configuracoes | (sem FAB) | Empresas | Empresas, Usuários, Planos, Faturas, Configurações |

Quando `fab` for opcional/ausente, renderizar um espaçador invisível no centro (mantém a simetria do notch).

### 3. Slot customizável (atalho por módulo)

- Novo hook `src/hooks/useModuleShortcut.ts`:
  - Estado por módulo em `localStorage`, chave `360food:mobile-shortcut:<módulo>`.
  - API: `{ shortcut, setShortcut, options }`.
  - Default: `defaultShortcut` do `MOBILE_NAV[módulo]`.
- Slot 4 na `MobileBottomNav`: usa o item retornado pelo hook para renderizar como `NavLeaf`.
- **Personalização**: long-press (≥550ms) no slot abre um `Sheet` pequeno "Escolha o atalho" listando `shortcutOptions` (radio-list). Também acessível pelo topo do "Mais" via botão "Personalizar barra".
- Feedback: `toast` + `navigator.vibrate(15)` ao trocar.

### 4. Ajustes de estilo/estado ativo

- Estado ativo do slot **Hub** e **Início** deve ganhar do slot Atalho quando as URLs se sobrepuserem (o cálculo atual pega o `to` mais específico — validar).
- No módulo `hub`: slot Hub e Início apontam ambos para `/hub`; ativar apenas Hub (marcar `homeTo` como não-ativo quando `pathname === hubTo` e forem iguais).
- Garantir contraste do `text-primary` sobre o notch em dark mode.

### 5. Validação (Playwright, viewport 393×852)

Screenshots em cada uma:

- `/hub` — barra visível, slot Hub ativo.
- `/dashboard` — Financeiro, Início ativo, FAB "Novo lançamento".
- `/lancamentos` — atalho padrão ativo.
- `/dp` — Início do DP ativo, FAB DP.
- `/dp/colaboradores` — atalho DP ativo.
- `/dp/meu` — Portal Início ativo.
- `/admin/estatisticas` — Admin barra visível, sem FAB (espaçador central).
- `/configuracoes` — módulo Conta.
- Long-press no atalho → sheet de personalização abre e persiste a escolha após reload.

## Fora do escopo

- Não redesenhar visual da barra (shape/notch/indicador já estão prontos).
- Não implementar novos FABs específicos por página (registros via `useMobileFab` seguem por demanda).
- Não mexer em desktop/sidebar/DpSidebar.
- Não alterar RLS, dados, nem funcionalidade de negócio.