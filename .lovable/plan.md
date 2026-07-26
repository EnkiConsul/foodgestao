## Melhorias Mobile Transversais — DP + todos os módulos

Todas as mudanças ficam em componentes compartilhados de layout mobile — valem automaticamente para **DP, Financeiro, Admin, Portal Colaborador e Hub**.

### 1. Header do módulo 100% fixo e discreto — `MoreHeader.tsx` + `Mais.tsx`
- Trocar `sticky top-14` por `fixed left-0 right-0 top-14` (imune ao jitter do momentum scroll iOS).
- Compactar: `py-1.5`, título `text-[13px] font-semibold`, campo Buscar `h-8 rounded-lg`. Altura final ~40 px (contra ~64 px hoje).
- `Mais.tsx`: adicionar `pt-10` no container do conteúdo para compensar o header fixo.

### 2. Personalizador de atalhos em lista única — `MobileBottomNav.tsx` (`ShortcutCustomizer`)
- Remover abas.
- Uma única lista onde cada item tem à direita dois chips: **[2º]** e **[4º]**. Tocar um chip fixa o item naquele slot.
- Indicadores "Atual (2º)" / "Atual (4º)" ao lado dos itens já em uso.
- Título: "Personalizar Barra Inferior".

### 3. Auto-hide da BottomNav ao rolar — `MobileBottomNav.tsx`
- Novo hook `useHideOnScroll()` interno: detecta direção do scroll do `window`. Ao descer >8 px, aplica `translate-y-full` na barra; ao subir, restaura.
- Transição `transition-transform duration-200 ease-out`. Ganho de área útil em listas longas.

### 4. Topbar global mais enxuto no mobile — `AppHeader.tsx` + `AdminLayout.tsx` + `MoreHeader.tsx`
- Reduzir de `h-14` para `h-12` no breakpoint mobile (`h-12 md:h-14`).
- Atualizar `MoreHeader` para `top-12 md:top-14` acompanhando a nova altura.

### 5. Swipe-back da borda esquerda — novo `src/hooks/useEdgeSwipeBack.ts`
- Detecta `touchstart` iniciado a <24 px da borda esquerda com deslocamento >60 px em <300 ms → dispara `navigate(-1)`.
- Ignorado se a rota atual for uma home de hub (`/`, `/dp/home`, `/admin/home`, `/portal/home`) ou se houver dialog aberto (verifica `document.querySelector('[role="dialog"][data-state="open"]')`).
- Instalado uma vez no `App.tsx` (ou `layouts` mobile).

### 6. Utilitário háptico compartilhado — novo `src/lib/haptics.ts`
- Extrair `haptic(ms)` do `MobileBottomNav.tsx`.
- Exportar `haptics.tap()` (8 ms), `haptics.select()` (12 ms), `haptics.success()` (20 ms), `haptics.warn()` ([10,40,10]).
- Aplicar em: ações de FAB, toggles do topo, seleção nos tiles de `/mais`, confirmar/cancelar em dialogs de destruição.

### 7. FAB contextual por rota — `src/config/mobileFab.ts` + `MobileFab.tsx`
- Novo mapa `rota-prefix → { label, icon, action }`.
- Rotas iniciais mapeadas:
  - `/lancamentos` → Novo lançamento
  - `/dp/colaboradores` → Novo colaborador
  - `/dp/folgas` → Nova solicitação de folga
  - `/dp/documentos` → Enviar documento
  - `/dp/aprovacoes` → (oculta o FAB)
  - `/admin/cadastros` → Novo cadastro
- Fallback: mantém o comportamento atual quando a rota não estiver mapeada.

### 8. Pull-to-refresh nas listas principais — novo `src/components/mobile/PullToRefresh.tsx`
- Wrapper leve baseado em `touchstart/touchmove/touchend` (sem lib externa); usa translate + spinner ao arrastar >64 px.
- Aplicar em: `/lancamentos`, `/dp/aprovacoes`, `/dp/colaboradores`, `/dp/folgas`, `/dp/documentos`.
- Callback chama `queryClient.invalidateQueries` das keys de cada tela.

### Fora do escopo
- Sem mudanças em dados, permissões, RLS, rotas ou desktop.
- Item 3G (busca global full-screen) fica adiado — a lupa compacta do `/mais` já cobre o caso principal por módulo.

### Ordem de implementação
1 → 2 → 4 → 3 → 5 → 6 → 7 → 8, para poder observar cada mudança separadamente na preview.