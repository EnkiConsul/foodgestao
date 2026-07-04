# Onda 1 — Auditoria: Componentes Globais + Mobile

Escopo desta onda: shell da aplicação (sidebar, header, bottom nav, layouts), primitivas compartilhadas (Button, Input, Dialog, Sheet, Table, Card, feedbacks) e comportamento em telas ≤430px. Nenhuma regra de negócio, cálculo, permissão, integração ou schema será tocado.

Após sua aprovação eu implemento as correções em pacotes (P0 → P1 → P2 → P3) e volto com o relatório de cada pacote.

---

## Inventário mapeado

**Layouts:** `AppLayout`, `AdminLayout`, `AppHeader`, `AppSidebar` (32 rotas), `AdminSidebar` (15 rotas), `BottomNav` (5 itens), `ContextSelector`, `NotificationsBell`.
**Overlays globais:** `SubscriptionBanner`, `InstallPrompt` (PWA), `PlinIAPanel` + `PlinIAFab`, `WhatsappButton`, `CookieConsentBanner`, Toaster (sonner + shadcn).
**Primitivas UI:** shadcn completo (48 arquivos em `components/ui`), `CurrencyInput`, `SearchableSelect`, `Logo`, `NavLink`.
**Rotas:** 33 autenticadas + 15 admin + 9 públicas/legais.

---

## Achados classificados

### P0 — Crítico (bloqueia uso ou causa erro visível)

1. **FAB de Lançamentos e ações mobile ocultas atrás de overlays.** `CookieConsentBanner` (z-60, `inset-x-3 bottom-3`) sobrepõe o FAB antes do consentimento; `WhatsappButton` (z-70, bottom-6) briga com `PlinIAFab` (z-40, bottom-24) e com o `BottomNav` (h-16). Já corrigi Lançamentos, mas o mesmo padrão precisa ser normalizado nas outras rotas com FAB/CTA fixo.
2. **`AppHeader` duplica `SidebarTrigger`** (`hidden md:flex` + `md:hidden`). Em mobile o menu abre corretamente, mas dois triggers renderizados quebram foco e leitura por screen reader.
3. **`main` com `pb-20` só cobre o BottomNav padrão (64px).** Quando o Sheet de teclado virtual abre em iOS, a última linha some porque `main` não usa `dvh`/safe-area. Impede confirmar formulários curtos em telas ≤375px.
4. **Botões só-ícone sem `aria-label`.** 52 ocorrências de `size="icon"` no projeto, 0 com `aria-label` nos arquivos de layout/Lançamentos amostrados. Bloqueia leitores de tela nos principais atalhos (privacidade, notificações, editar/excluir, etc.).

### P1 — Alto impacto

5. **`AppSidebar` com 2 grupos de 7+9 itens sem hierarquia.** "Gerenciar" mistura cadastros (Contas, Categorias) com cobrança (Meu Plano, Faturas) e usuários. Aumenta tempo de encontrar. Reagrupar em: *Financeiro*, *Cadastros*, *Cobrança*, *Configurações*.
6. **BottomNav com item "Mais" apontando direto para `/configuracoes`.** Perde acesso rápido a Relatórios, Orçamento avançado, Contatos. Trocar por Sheet "Mais" que espelhe o sidebar em mobile.
7. **`ContextSelector` sem estado visual quando o contexto está inválido** (ex.: PJ selecionada sem empresa). Usuário perde clique tentando filtrar.
8. **Sem safe-area/`env(safe-area-inset-*)` no `BottomNav`, `FAB`, banners.** Em iPhones com notch, ícones colam na barra inferior. `AppLayout` usa `min-h-screen` (a corrigir para `min-h-dvh`).
9. **Feedback inconsistente.** Coexistem `sonner` (`toast.success`) e o antigo `use-toast` shadcn. Precisa consolidar em um só (proponho sonner) para padronizar posição, duração, ícones e acessibilidade.
10. **`Button` icon = 40×40**, borderline para toque em mobile e menor que `min-h-11` recomendado para CTAs primários; padronizar variantes `iconSm`/`iconMd` e reforçar 44px em ações críticas.
11. **Sheet/Dialog em mobile sem `max-h-[100dvh]` consistente.** Vários formulários (Lançamento já ajustado; Contato, Conta Bancária, Categoria ainda não) usam `max-h-[90vh]` que corta em teclado aberto.
12. **`NotificationsBell` popover 384px em telas 360px** cria overflow horizontal e clipping (empurra para fora da tela). Precisa virar Sheet lateral em mobile.

### P2 — Médio impacto

13. **Tokens hardcoded fora do design system:** `#25D366` (WhatsApp), `text-gray-*`/`bg-gray-*` em 7 arquivos, `text-[#…]`/`bg-[#…]` em 2. Mover para tokens semânticos (`--brand-whatsapp`, `--muted-foreground`, etc.).
14. **Densidade heterogênea de cards e badges.** Cards de KPI em Dashboard, Lançamentos e Fluxo de Caixa usam paddings/tamanho de fonte diferentes. Padronizar `KpiCard`.
15. **Estados vazios genéricos.** Várias tabelas mostram "Nenhum registro encontrado" sem CTA. Introduzir `EmptyState` padrão com título + orientação + botão da ação primária (usando ações já existentes).
16. **`Table` sem tratamento mobile fora de Lançamentos.** Contatos, Contas Bancárias, Categorias, Faturas rolam horizontalmente sem sinalização e sem versão em cards. Definir padrão: colunas prioritárias + `Sheet` de detalhes/ações.
17. **Skeletons ausentes.** Maioria das páginas usa spinner central; substituir por skeletons proporcionais ao layout final (KPIs, tabela, cards) para melhorar performance percebida.
18. **Focus-visible fraco em `NavLink` e itens de sidebar/bottom nav.** Não há anel visível ao tabular (só cor). Adicionar `focus-visible:ring-2 ring-ring`.
19. **Contraste dos textos secundários** (`text-sidebar-foreground/50`, `text-muted-foreground/50`) fica abaixo de AA no tema claro. Elevar para `/70` no mínimo.
20. **Overflow horizontal em Landing/Guias/DasMei/DREComparativo** (4 páginas com `overflow-x-*` sem contêiner). Auditar para não haver scroll horizontal involuntário no body em ≤430px.

### P3 — Refinamento

21. Microcopy de erros ("Erro ao carregar", "Falha") → mensagens acionáveis.
22. Transições de rota sem `ScrollToTop` global consistente em mobile (algumas voltam no meio da página).
23. Bordas/sombras/`radius` variam entre `rounded-md/lg/xl`; unificar escala.
24. Espaçamentos ad-hoc (`p-3 sm:p-6`, `gap-3`, `space-y-4`) → escala 4/8/12/16/24/32.
25. Ícones com tamanhos livres (`h-3 w-3` a `h-6 w-6`); definir escala `xs/sm/md/lg`.
26. Animações do sidebar (`hover:translate-x-1`) desligadas via `prefers-reduced-motion`.

---

## Escopo das correções (Onda 1)

### Pacote A — Fundamentos globais (P0)
- **App shell**: `AppLayout` para `min-h-dvh`, `main` com `pb-[calc(4rem+env(safe-area-inset-bottom))]`; remover `SidebarTrigger` duplicado do header.
- **Overlays**: definir escala oficial de z-index (`z-nav 40`, `z-fab 45`, `z-header 50`, `z-overlay 60`, `z-toast 70`, `z-modal 80`) e aplicar em FAB, WhatsApp, PlinIA, cookie banner, install prompt, sonner.
- **A11y de ícones**: passar em Header, Sidebar, BottomNav, Lançamentos, tabelas de listagem e adicionar `aria-label` em todo `size="icon"`.
- **Safe area**: BottomNav, FAB, banners com `env(safe-area-inset-bottom)`.

### Pacote B — Navegação (P1)
- Reagrupar `AppSidebar` em 4 seções semânticas; manter todos os itens e rotas.
- Substituir "Mais" do `BottomNav` por Sheet com todos os itens do sidebar (em mobile).
- `ContextSelector` com estado de aviso quando PJ sem empresa selecionada + link para escolher.
- `NotificationsBell` → Sheet direita em `<md`; Popover mantido em desktop.

### Pacote C — Primitivas compartilhadas (P1/P2)
- `Button`: novas variantes `size="iconSm"` (36) e reforço de `min-h-11` em CTAs primários; tokens de foco consistentes.
- Consolidar toasts em `sonner` (remover `use-toast` gradualmente sem quebrar chamadas — wrapper de compat).
- `Dialog`/`Sheet`: helper `ResponsiveDialog` que vira Sheet bottom em `<md`, `max-h-dvh`, safe-area, scroll interno.
- `EmptyState`, `KpiCard`, `PageHeader`, `SectionTitle` como componentes reutilizáveis (usando tokens atuais).
- Skeletons padronizados por template (tabela, KPI, cards).

### Pacote D — Design tokens (P2)
- Mover cores WhatsApp, cinzas hardcoded e hexadecimais soltos para tokens em `index.css` + `tailwind.config.ts`.
- Elevar contraste dos textos secundários acima de 4.5:1.
- Padronizar escala de radius/sombras/espaço.

### Pacote E — Responsividade base (P1/P2)
- Auditoria automática das 4 páginas com overflow horizontal e correção via contêiner.
- Aplicar `overflow-x-auto` sinalizado (gradient edge) nas tabelas listadas em P2 e criar variante em cards para mobile.
- Testes visuais em 320/375/390/430/768/1024/1440 nas rotas principais (Playwright screenshots como evidência).

### Pacote F — Refinamentos (P3, opcional nesta onda)
- Microcopy de erros, ScrollToTop, unificação de radius/gap/ícones, `prefers-reduced-motion`.

---

## O que **não** será feito nesta onda
- Redesenho de Dashboard, Lançamentos, Relatórios, DRE, Orçamento (Onda 2/3).
- Landing, Auth, Onboarding, Checkout, Planos (Onda 4).
- Mudanças em RLS, edge functions, queries, cálculos, categorias/status.
- Substituição do sidebar shadcn ou remoção de rotas.

## Riscos e mitigação
- **Wrapper de toasts** pode conflitar com chamadas antigas → mantém API `toast.success/error` inalterada.
- **Reagrupamento do sidebar** muda ordem mas preserva rotas e permissões → sem impacto em navegação profunda/bookmarks.
- **ResponsiveDialog** só é aplicado em formulários já mapeados; demais Dialogs permanecem intactos até revisão individual.
- Cada pacote entra em commit isolado com screenshot antes/depois para você revisar.

## Ordem sugerida de execução (após aprovação)
```text
1. Pacote A (P0)               ← fundamentos + a11y de ícones
2. Pacote D (tokens P2)        ← base para B/C
3. Pacote C (primitivas)       ← libera padrão para todas as telas
4. Pacote B (navegação)
5. Pacote E (responsividade)
6. Pacote F (refinamentos)     ← opcional, posso adiar para Onda 2
```

Quer que eu execute nessa ordem, ou prefere reordenar/remover algum pacote antes de eu começar?
