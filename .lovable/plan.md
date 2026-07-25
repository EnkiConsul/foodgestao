
# Experiência Mobile Impecável — 360°FOOD (todos os módulos)

## Diagnóstico

### Bug crítico reportado
No celular, logado como Pakerê, o usuário só vê a **landing page** e o **módulo financeiro**. Não consegue chegar ao **Hub de Módulos** nem ao **módulo DP**.

Causa provável (a confirmar antes de corrigir): a sidebar do financeiro (`src/components/layout/AppSidebar.tsx`) contém o link "Hub de Módulos" mas depende do `SidebarTrigger` para abrir no mobile — e o header pode não estar mostrando esse gatilho de forma consistente. Sem forma visível de acionar a sidebar, o usuário fica preso ao módulo em que caiu no login. A fase 0 confirma o caminho exato antes de qualquer ajuste.

### Auditoria contra o Pakerê (arquivos enviados)

Padrões do Pakerê que ainda não estão no 360°FOOD:

1. **Tabela ↔ Cards duplo**: `hidden md:block` + `md:hidden space-y-4`. Hoje quase todas as listagens usam `overflow-x-auto` (tabela rola de lado).
2. **Diálogos que viram Sheet no mobile** (Colaborador, Documento, Atestado, Adiar Pendência, etc.).
3. **Botões e cards com `active:scale-[0.98]` e `min-h-11 min-w-11`** para tap targets.
4. **Header mobile compacto** com `SidebarTrigger` sempre visível.
5. **Filtros em grid responsivo** (empilham em 1-2 colunas no mobile) em vez de flex-row.
6. **Widget de pendências mobile-first**: card inteiro clicável, botões `w-full h-11` empilhados.

## Regra transversal de conteúdo — Title Case nos títulos

Aplicar em **toda** a UI enquanto tocarmos as páginas nas fases abaixo:

- Títulos de página, cards, seções, diálogos, botões primários e itens de menu escritos com **Primeira Letra De Cada Palavra Em Maiúscula**.
- Exceções (ficam em minúsculas, salvo quando são a primeira palavra do título):
  - Artigos: **a, o, as, os, um, uma, uns, umas**
  - Preposições: **de, da, do, das, dos, em, na, no, nas, nos, por, para, com, sem, sob, sobre, entre, até, ante, após**
  - Conjunções curtas: **e, ou, mas, nem, se, que**
- Substantivos, verbos, adjetivos, advérbios e pronomes ficam capitalizados mesmo se curtos ("É", "Ao", "Se" reflexivo em imperativos).
- Siglas mantêm o formato original: **PF, PJ, DP, CNPJ, CPF, CCT, ACT, PIX, IA**.
- Marcas mantêm a grafia oficial: **360°FOOD**, **Pakerê**, **Lovable**.

Exemplos:
- "cadastro de colaboradores" → **Cadastro de Colaboradores**
- "trocas e solicitações" → **Trocas e Solicitações**
- "histórico completo de documentos" → **Histórico Completo de Documentos**
- "voltar ao hub" → **Voltar ao Hub**
- "novo lançamento" → **Novo Lançamento**

Fora do escopo desta regra: textos corridos, descrições, tooltips, placeholders, mensagens de toast, legendas de gráfico — permanecem em capitalização normal de frase.

## Escopo — Mobile-first em todo o sistema

### Fase 0 — Correção do bug de navegação mobile (prioridade)
- Investigar layout do financeiro e confirmar por que a sidebar não é acessível no mobile.
- `SidebarTrigger` sempre visível no header de todos os módulos.
- Adicionar botão explícito **Voltar ao Hub** no header mobile de cada módulo.
- Validar com Playwright em 375×812 no papel do usuário Pakerê.

### Fase 1 — Shells e headers responsivos
- Header sticky `h-14 px-3 md:px-4` com `SidebarTrigger`, `ContextSelector` compacto (bandeira + iniciais no `< sm`), botão **Hub** e sinos.
- `main` com `p-3 md:p-6 lg:p-8`.
- Sidebar fecha ao clicar em link no mobile (`setOpenMobile(false)`).
- **Hub de Módulos**: grid `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`, cards com `min-h-[180px]`.

### Fase 2 — Utilitários compartilhados
- `src/components/ui/responsive-data-table.tsx` — tabela desktop + cards mobile (`active:scale-[0.98]`).
- `src/components/ui/responsive-dialog.tsx` — `Dialog` no desktop, `Sheet side="bottom"` no mobile (`max-h-[92vh] overflow-y-auto`), API igual.
- Reusa `useIsMobile()` de `src/hooks/use-mobile.ts`.

### Fase 3 — Módulo Financeiro mobile
Aplicar tabela↔card, `ResponsiveDialog` e regra de Title Case nos títulos em: `Lancamentos`, `Faturas`, `ContasBancarias`, `CartoesCredito`, `Contatos`, `Categorias`, `FormasPagamento`, `Orcamento`, `Relatorios`, `FluxoCaixa`, `ContasContabeis`, `Dashboard`, `Buscar`.
Toolbars viram `grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2`.

### Fase 4 — Módulo DP mobile
- `DpHome`, `PendenciasCard` (card clicável → Sheet, botões `w-full h-11`).
- Listagens com card mobile: `DpColaboradores`, `DpUnidades`, `DpCargos`, `DpDocumentos`, `DpDocumentosPorTipo`, `DpAtestados`, `DpDisciplinar`, `DpHistoricoCompleto`, `DpSindicatoNegociacoes`, `DpModelosMensagem`, `DpNotificacoes`, `DpTrocas`, `DpSolicitacoes`, `DpAprovacoes`, `DpBloqueios`.
- Diálogos → `ResponsiveDialog`: `ColaboradorFormDialog`, `DpCalendarDayDialog`, `RecusaDialog`, `WhatsappComposerDialog`, `ConfirmarSubstituicaoDialog`, `LiberarEscopoDialog` e inline dialogs de atestado/disciplinar/troca/solicitação/modelo.
- `FolgaCalendarShared`: tap targets `min-h-14` nos itens da lista mobile.

### Fase 5 — Módulo Admin / Configurações
- `/admin/cadastros`, `Planos`, `Empresas`, `GestaoUsuarios`, `Configuracoes`, `Onboarding` recebem `ResponsiveDataTable` e `ResponsiveDialog`.
- Wizards: cada step cabe em 360 px, botões âncoras em `sticky bottom-0`.

### Fase 6 — Auth, Landing e Checkout
- Landing: contraste e CTAs ≥ 48 px no mobile.
- `Auth`, `PrimeiroAcesso`, `EsqueciSenha`, `ResetPassword`, `AcceptInvite`: inputs `h-11`, botões full-width, `inputMode` numérico em CPF/CNPJ.
- `Checkout` e `CheckoutPagamento`: stepper vertical e resumo em sticky footer.

### Fase 7 — Polimento transversal
- **Tap targets**: `size="icon"` em listas → `min-h-11 min-w-11 md:min-h-9 md:min-w-9`.
- 3+ ações por linha → `DropdownMenu` com `MoreVertical`.
- Badges: `text-[9px]` → `text-[11px]` no mobile.
- `sonner` position `top-center` no mobile.
- Safe area: `pb-[env(safe-area-inset-bottom)]` em elementos sticky-bottom.
- Buscar e remover `w-screen` / `min-w-` fixos que causam overflow.
- Passar Title Case em todos os títulos tocados nas fases anteriores (mais varredura final em `src/pages/**/*.tsx` para pegar títulos remanescentes).

### Fase 8 — Validação
- Playwright em 375×812, 414×896 e 768×1024: fluxo Landing → Login → Hub → Financeiro → DP → Configurações → Logout + cadastro de lançamento, cadastro de colaborador, aprovação de solicitação, adiar pendência.
- Lighthouse mobile em `/`, `/hub`, `/lancamentos`, `/dp` — meta: Best Practices ≥ 95, Accessibility ≥ 95.

## Ordem de execução

1. **Fase 0** — Corrigir navegação mobile (bloqueador).
2. **Fase 1** — Shells e headers.
3. **Fase 2** — `ResponsiveDataTable` e `ResponsiveDialog`.
4. **Fase 3** — Financeiro.
5. **Fase 4** — DP.
6. **Fase 5** — Admin.
7. **Fase 6** — Auth/Landing/Checkout.
8. **Fase 7** — Polimento + varredura de Title Case.
9. **Fase 8** — Validação Playwright + Lighthouse.

Cada fase entrega screenshots antes/depois em 375×812.

## Fora do escopo

- Sem mudança de RLS, RPC, migração ou regra de negócio.
- Sem redesign de identidade visual (paleta, logo e tipografia permanecem).
- Sem PWA offline / service worker (o app já é instalável via manifest).
- Sem Capacitor/app nativo agora — foco em web mobile impecável. Publicação em app stores é outro projeto que discutiremos depois.

## Detalhes técnicos

- Detecção mobile só via `useIsMobile()` (breakpoint 768 px).
- `ResponsiveDialog` e `ResponsiveDataTable` são puramente apresentacionais — não alteram fetch/mutations/estado.
- Uso apenas de shadcn já instalado (`Sheet`, `Dialog`, `DropdownMenu`). Sem libs novas.
