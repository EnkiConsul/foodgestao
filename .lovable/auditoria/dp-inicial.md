# Auditoria Inicial — Módulo DP (360°FOOD)

Modo: **AUDITORIA** — nenhum arquivo do projeto foi alterado.
Fonte de verdade: repositório `pakere1996/portalcolaborador`, branch `main`.
Data: 2026-07-16.

---

## DP-G00 — Inventário técnico

### 1. Rotas DP no projeto atual

Definidas em `src/App.tsx`. O DP tem **dois shells distintos**:

- **Portal do colaborador** — `PortalProtected` + `ColaboradorShell`, rota base `/dp/meu` (não usa `SubscriptionGuard` nem `ModuleGuard`).
- **Área administrativa** — `ProtectedRoute` + `SubscriptionGuard` + `ModuleGuard("dp")` + `DpLayout`, rota base `/dp`.

Portal (`/dp/meu`):

| Rota | Página |
|---|---|
| `/dp/meu` | `DpMeuHome` |
| `/dp/meu/perfil` | `DpMeuPerfil` |
| `/dp/meu/documentos` | `DpMeuDocumentos` |
| `/dp/meu/solicitacoes` | `DpMeuSolicitacoes` |
| `/dp/meu/trocas` | `DpMeuTrocas` |
| `/dp/meu/calendario` | `DpMeuCalendario` |
| `/dp/meu/atestados` | `DpMeuAtestados` |
| `/dp/meu/disciplinar` | `DpMeuDisciplinar` |
| `/dp/meu/sindicato` | `DpMeuSindicato` |
| `/dp/meu/historico` | `DpMeuHistorico` |

Administrativo (`/dp`):

| Rota | Página |
|---|---|
| `/dp` | `DpHome` |
| `/dp/colaboradores` | `DpColaboradores` |
| `/dp/solicitacoes` | `DpSolicitacoes` |
| `/dp/folgas` | `DpFolgasHub` |
| `/dp/folgas/calendario` | `DpFolgas` |
| `/dp/calendario` | `DpAdminCalendario` |
| `/dp/documentos` | `DpDocumentosHub` |
| `/dp/documentos/todos` | `DpDocumentos` |
| `/dp/documentos/historico` | `DpHistoricoCompleto` |
| `/dp/documentos/:categoria` | `DpDocumentos` |
| `/dp/atestados` | `DpAtestados` |
| `/dp/avisos` | `DpAvisos` |
| `/dp/mensagens` | `DpMensagens` |
| `/dp/modelos-mensagem` | `DpModelosMensagem` |
| `/dp/comunicacao` | `DpComunicacaoHub` |
| `/dp/disciplinar` | `DpDisciplinar` |
| `/dp/bloqueios` | `DpBloqueios` |
| `/dp/trocas` | `DpTrocas` |
| `/dp/aprovacoes` | `DpAprovacoes` |
| `/dp/documentos/importar` | `DpDocImportBulk` |
| `/dp/cadastros` | `DpCadastrosHub` |
| `/dp/cadastros/unidades` | `DpUnidades` |
| `/dp/cadastros/cargos` | `DpCargos` |
| `/dp/cadastros/sindicatos` | `DpSindicatos` |
| `/dp/documentos/act-cct` | `DpSindicatoNegociacoes` |
| `/dp/folha` | `DpFolhaHub` |
| `/dp/folha/aprovacoes` | `DpFolhaAprovacoes` |
| `/dp/folha/periodos/:id` | `DpFolhaPeriodo` |
| `/dp/sindicatos` → redirect | `/dp/cadastros/sindicatos` |
| `/dp/unidades` → redirect | `/dp/cadastros/unidades` |
| `/dp/cargos` → redirect | `/dp/cadastros/cargos` |
| `/dp/sindicatos/negociacoes` → redirect | `/dp/documentos/act-cct` |
| `/dp/cadastros/sindicatos/negociacoes` → redirect | `/dp/documentos/act-cct` |
| `/dp/documentos/sindicato` → redirect | `/dp/documentos/act-cct` |
| `/dp/comunicacao/avisos` → redirect | `/dp/avisos` |
| `/dp/comunicacao/mensagens` → redirect | `/dp/mensagens` |

### 2. Rotas na referência (Pakerê)

Colaborador (raiz `/`): `/home`, `/perfil`, `/calendario`, `/trocas`, `/historico`, `/documentos`, `/documentos/atestados`, `/documentos/ponto` (mesma página que `/documentos`), `/documentos/disciplinar`, `/documentos/sindicato`.

Admin (raiz `/admin`): `/admin/home`, `/admin/cadastro` (hub), `/admin/comunicacao` (hub), `/admin/colaboradores`, `/admin/cargos`, `/admin/unidades`, `/admin/cadastro/sindicatos`, `/admin/documentos/act-cct`, `/admin/folgas` (dashboard), `/admin/calendario`, `/admin/solicitacoes`, `/admin/aprovacoes`, `/admin/trocas`, `/admin/bloqueios`, `/admin/documentos` (hub), `/admin/documentos/contracheque`, `/admin/documentos/ponto`, `/admin/documentos/adiantamento`, `/admin/documentos/historico`, `/admin/documentos/atestados`, `/admin/documentos/disciplinar`, `/admin/mensagens`, `/admin/avisos`, `/admin/setup`, `/setup`, `/login`.

Não existem na referência: `/dp/folha*`, `/dp/documentos/importar`, `/dp/modelos-mensagem`. Marcados como **Extra** (fora da doc, avaliar preservação).

### 3. Mapeamento rota-a-rota (doc → atual)

| Doc | Atual | Status |
|---|---|---|
| `/login` | `/auth` (compartilhado) | Divergente (adaptado 360°FOOD) |
| `/home` (colaborador) | `/dp/meu` | Conforme (nome muda) |
| `/perfil` | `/dp/meu/perfil` | Conforme |
| `/calendario` | `/dp/meu/calendario` | Conforme |
| `/trocas` | `/dp/meu/trocas` | Conforme |
| `/historico` | `/dp/meu/historico` | Conforme |
| `/documentos` | `/dp/meu/documentos` | Conforme |
| `/documentos/ponto` | — (mesma tela `/dp/meu/documentos` na doc) | Parcialmente conforme — verificar filtro por tipo |
| `/documentos/atestados` | `/dp/meu/atestados` | Conforme |
| `/documentos/disciplinar` | `/dp/meu/disciplinar` | Conforme |
| `/documentos/sindicato` | `/dp/meu/sindicato` | Conforme |
| `/admin/home` | `/dp` | Conforme |
| `/admin/cadastro` | `/dp/cadastros` | Conforme |
| `/admin/colaboradores` | `/dp/colaboradores` | Conforme |
| `/admin/cargos` | `/dp/cadastros/cargos` | Conforme (URL agrupada em cadastros) |
| `/admin/unidades` | `/dp/cadastros/unidades` | Conforme |
| `/admin/cadastro/sindicatos` | `/dp/cadastros/sindicatos` | Conforme |
| `/admin/folgas` (dashboard) | `/dp/folgas` (`DpFolgasHub`) | Divergente — atual é hub, doc é dashboard com indicadores/sorteio |
| `/admin/calendario` | `/dp/calendario` (`DpAdminCalendario`) e `/dp/folgas/calendario` (`DpFolgas`) | **Divergente / potencial duplicidade** — ver DIV-INV-01 |
| `/admin/solicitacoes` | `/dp/solicitacoes` | Conforme |
| `/admin/aprovacoes` | `/dp/aprovacoes` | Conforme |
| `/admin/trocas` | `/dp/trocas` | Conforme |
| `/admin/bloqueios` | `/dp/bloqueios` | Conforme |
| `/admin/documentos` | `/dp/documentos` | Conforme |
| `/admin/documentos/contracheque` | `/dp/documentos/contracheque` (via `:categoria`) | Parcialmente conforme — mesma página genérica com parâmetro |
| `/admin/documentos/ponto` | `/dp/documentos/ponto` (via `:categoria`) | Parcialmente conforme |
| `/admin/documentos/adiantamento` | `/dp/documentos/adiantamento` (via `:categoria`) | Parcialmente conforme |
| `/admin/documentos/historico` | `/dp/documentos/historico` | Conforme |
| `/admin/documentos/atestados` | `/dp/atestados` | Divergente — doc mantém sob `/admin/documentos/atestados` |
| `/admin/documentos/disciplinar` | `/dp/disciplinar` | Divergente — mesma questão |
| `/admin/documentos/act-cct` | `/dp/documentos/act-cct` | Conforme |
| `/admin/mensagens` | `/dp/mensagens` | Conforme |
| `/admin/avisos` | `/dp/avisos` | Conforme |
| `/admin/comunicacao` | `/dp/comunicacao` | Conforme |
| `/admin/setup`, `/setup` | ausente no DP (usa fluxo global 360°FOOD) | Não aplicável — arquitetura diferente |

### 4. Rotas quebradas / duplicadas / menus inconsistentes

| ID | Item | Descrição | Gravidade |
|---|---|---|---|
| DIV-INV-01 | Duplicidade `/dp/calendario` × `/dp/folgas/calendario` | Existem duas páginas de calendário administrativo: `DpAdminCalendario` (em `/dp/calendario`) e `DpFolgas` (em `/dp/folgas/calendario`). Na doc há apenas `/admin/calendario`. O sidebar principal (`DpSidebar`) aponta para `/dp/folgas/calendario`; o sidebar antigo (`DpMenu`) aponta para `/dp/folgas`. | Alta — risco de divergência funcional entre as duas telas |
| DIV-INV-02 | Sidebar duplicado | Existem dois sidebars para DP: `src/components/dp/DpSidebar.tsx` (novo, usado por `DpShell`/`DpLayout`) e `src/components/layout/sidebar-menus/DpMenu.tsx` (antigo, ainda usado pelo `AppSidebar` no Hub financeiro). Estruturas divergem (Operação/Comunicação/Compliance/Folha/Cadastros × Cadastro/Folgas/Documentos/Comunicação). | Média — sidebar antigo pode ficar exposto por outro shell |
| DIV-INV-03 | `/dp/documentos/todos` não aparece em menu | Rota existe mas nenhum item de navegação leva até ela; é sombreada por `/dp/documentos/:categoria`. | Baixa — rota morta ou catch-all indevido |
| DIV-INV-04 | `/dp/atestados` vs `/dp/documentos/atestados` | Doc coloca gestão de atestados em `/admin/documentos/atestados`; atual usa `/dp/atestados` (fora de `documentos/`). Sidebar admin novo cita como “Atestados” no grupo Documentos, mas com URL `/dp/documentos/atestado` (singular) que não existe. | Alta — link do menu leva a 404 |
| DIV-INV-05 | Menu “Adiantamentos” do sidebar novo | `DpSidebar` aponta para `/dp/documentos/adiantamento`; existe apenas via rota genérica `/dp/documentos/:categoria`. Precisa confirmar que `DpDocumentos` trata `categoria === "adiantamento"`. | Média |
| DIV-INV-06 | Menu “Registros Disciplinares” | Sidebar novo aponta para `/dp/disciplinar`; doc esperava `/admin/documentos/disciplinar` (dentro do grupo Documentos). Coerente com arquitetura atual, mas cria diferença de agrupamento. | Baixa |
| DIV-INV-07 | Ausência de `/dp/folgas` como dashboard | `/dp/folgas` renderiza `DpFolgasHub` (hub visual). Doc esperava `FolgasHub`/`FolgasDashboard` com indicadores, sorteio, alertas — a auditoria específica DP-A07 confirmará o gap. | Alta |
| DIV-INV-08 | `PortalProtected` ignora `ModuleGuard` e `SubscriptionGuard` | Colaborador entra em `/dp/meu` mesmo se o módulo DP não estiver contratado ou a assinatura estiver bloqueada. Divergente da árvore administrativa; potencial risco de negócio. | Crítica (validar regra) |

### 5. Componentes DP presentes

`src/components/dp/`:
`ColaboradorFormDialog`, `ColaboradorShell`, `DocumentPreview`, `DpCalendarDayDialog`, `DpHeader`, `DpLayout`, `DpNotificacoesBell`, `DpPage` (+ `DpPageHeader`, `DpContentCard`, `DpFilterCard`, `DpHubGrid`, `DpEmptyState`), `DpShell`, `DpSidebar`, `DpSkeletons`, `DpStatusBadge`, `FavoriteToggle`, `FolgaCalendar`, `HistoricoDisciplinar`, `NavigationCard`, `WhatsappComposerDialog`, `favoritablePages`, `home/*`.

Referência: `AppShell`, `NavigationCard`, `ColaboradorForm`, `ColaboradorFormDialog`, `DocumentImportForm`, `DocumentPreview`, `DocumentosAdminBase`, `DocumentosBase`, `FavoritarBotao`, `FolgaCalendar`, `HistoricoDisciplinar`, `NotificationBell`, `PendenciasWidget`, `AtestadosPendentesPopout`, `AvisosPopout`, `AniversariantesWidget`, `SocialIcons`, `SocialLoginButtons`.

Faltando (nomes equivalentes): **`DocumentImportForm`** (existe como página `DpDocImportBulk`, arquitetura diferente), **`DocumentosAdminBase`/`DocumentosBase`** (não há classe base compartilhada — cada tela reimplementa), **`PendenciasWidget`** (existe como card em `components/dp/home/PendenciasCard.tsx`).

### 6. Hooks DP presentes

`useDpAniversariantes30d`, `useDpAtestadosPendentes`, `useDpCadastros`, `useDpColaboradores`, `useDpComunicacao`, `useDpModelosMensagem`, `useDpNotificacoes`, `useDpPendencias`, `useDpUserPrefs`.

### 7. Edge Functions DP

`dp-doc-bulk-approve`, `dp-doc-bulk-ingest`, `dp-generate-disciplinary-pdf`, `dp-invite-colaborador`, `dp-notify-atestado`, `dp-send-broadcast`, `dp-sorteio-folgas`.

Doc referencia edge function `login-with-cpf` — **não existe** no projeto atual (login por CPF é substituído pelo login por e-mail do 360°FOOD).

### 8. Tabelas `dp_*`

Da lista de tabelas: `dp_avisos`, `dp_avisos_leituras`, `dp_bloqueio_regra_unidades`, `dp_bloqueio_regras`, `dp_bloqueios`, `dp_bulk_import_batches`, `dp_bulk_import_items`, `dp_cargos`, `dp_colaboradores`, `dp_datas_bloqueadas`, `dp_dia_config`, `dp_documentos`, `dp_folgas`, `dp_folgas_canceladas`, `dp_folha_lancamentos`, `dp_folha_periodos`, `dp_mensagens`, `dp_modelos_mensagem`, `dp_notificacoes`, `dp_prioridade_aniversario`, `dp_registros_disciplinares`, `dp_sindicato_cargos`, `dp_sindicato_negociacoes`, `dp_sindicato_unidades`, `dp_sindicatos`, `dp_solicitacoes`, `dp_trocas`, `dp_unidade_cargos`, `dp_unidades`, `dp_user_prefs`.

Cobertura: compatível com o esperado pela referência + extras `dp_folha_*`, `dp_bulk_import_*`, `dp_modelos_mensagem`.

### 9. Assets

`src/assets/360food-*.asset.json` (assinatura, símbolo, avatar, ícone, horizontal). Marca 360°FOOD preservada — nenhuma referência a `pakere-logo.png`.

---

## DP-G01 — Login

### 1. Identificação

- Perfil de acesso: **público** (usuário não autenticado).
- Rota na doc: `/login` (`src/pages/Login.tsx`).
- Rota no módulo atual: `/auth` (`src/pages/Auth.tsx`) — reaproveitada do produto 360°FOOD.
- Componentes relacionados na doc: `formatCPF` (`@/lib/cpf`), edge function `login-with-cpf`, `useAuth` (`@/lib/auth-context`).
- Objetivo: autenticar colaborador/administrador e direcionar para a área correta.
- Status geral: **Divergente** — arquitetura de auth é diferente por design do 360°FOOD.
- Aderência estimada: 25%.

### 2. Estrutura esperada (doc)

- Container centralizado, gradient `from-primary/5 to-primary/10`.
- Título `Portal do Colaborador` + subtítulo `Acesse sua conta usando CPF e senha`.
- Campo **CPF** com máscara `000.000.000-00`, ícone `IdCard`.
- Campo **Senha** com ícone `Lock`.
- Botão **Entrar** (h-12, full width).
- Rodapé: `Esqueceu sua senha? Entre em contato com o administrador.`
- Fluxo: chama edge function `login-with-cpf`, seta `supabase.auth.setSession`, busca `user_roles`, grava `localStorage.user_role`, redireciona `/admin/home` (admin) ou `/home` (colaborador).
- Toasts (`sonner`) para sucesso e erros específicos (CPF inválido, senha incorreta, CPF inexistente).

### 3. Estrutura encontrada (`src/pages/Auth.tsx`)

- Página multi-modo: login por **e-mail + senha**, cadastro, reset, MFA challenge.
- Zod schemas (`loginSchema`/`signupSchema`), `react-hook-form` conceitual + Zod, tracking `trackEvent(FunnelStep.*)`.
- Suporta aceitação de termos, nome completo, confirmação de senha, MFA TOTP.
- Após login: redirect via `PublicOnlyRoute` → `safeRedirect(searchParams.get("redirect"))` (default `/hub`).
- Redirecionamento por perfil DP é feito por `RootGate` na entrada `/` (verifica `is_dp_colaborador` RPC + roles) — **não pelo Auth**.

### 4. Matriz de divergências

| ID | Categoria | Elemento | Esperado (doc) | Encontrado | Status | Gravidade |
|---|---|---|---|---|---|---|
| DIV-G01-01 | Autenticação | Identificador | CPF (14 caracteres, máscara) | E-mail | Divergente | Não aplicável — regra do 360°FOOD (multi-tenant SaaS) |
| DIV-G01-02 | Backend | Fluxo | Edge function `login-with-cpf` + `setSession` | `supabase.auth.signInWithPassword` | Divergente | Não aplicável |
| DIV-G01-03 | Redirecionamento | Pós-login | localStorage `user_role` + navigate direto | `RootGate` RPC `is_dp_colaborador` + roles | Divergente | Média — semanticamente equivalente, mas leva um step extra |
| DIV-G01-04 | Layout | Título | `Portal do Colaborador` | Título 360°FOOD | Divergente | Não aplicável (identidade) |
| DIV-G01-05 | Layout | Marca | Cores/logo Pakerê | Cores/logo 360°FOOD | Não aplicável | — |
| DIV-G01-06 | Fluxo | Signup público | Não existe na doc | Existe (`/auth` aceita signup) | Extra | Média — colaborador DP não deve se auto-cadastrar; validar |
| DIV-G01-07 | Rodapé | Ajuda | “Esqueceu sua senha? Entre em contato com o administrador.” | Link `Esqueceu a senha?` → `/reset-password` | Divergente | Baixa — comportamento superior no atual |
| DIV-G01-08 | Segurança | MFA | Ausente | MFA TOTP obrigatório para AAL2 | Extra | Baixa (ganho de segurança) |
| DIV-G01-09 | Rota | `/setup` | Existe rota pública `/setup` para primeiro admin | Ausente no DP (fluxo via onboarding 360°FOOD) | Ausente | Não aplicável |

### 5. Layout / 6. Funcional

Diferenças de layout são intencionais pela identidade 360°FOOD. Diferenças funcionais listadas em DIV-G01-01/02/03/06. Nenhuma quebra encontrada.

### 7. Formulários

| Campo | Doc | Atual | Divergência |
|---|---|---|---|
| CPF | obrigatório, máscara | ausente | Divergente por design |
| E-mail | ausente | obrigatório, Zod | Divergente por design |
| Senha | obrigatório | obrigatório, min 6 | Conforme |
| Confirmar senha | ausente | obrigatório no signup | Extra |
| Aceite de termos | ausente | obrigatório no signup | Extra |
| Nome completo | ausente | obrigatório no signup | Extra |

### 8. Diálogos

- Doc: nenhum.
- Atual: `MfaChallenge` (dialog interno). Extra — mantém.

### 9. Estados

Ambas cobrem `busy/loading` e mensagens de erro. Atual tem MFA em progresso adicional.

### 10. Responsividade

Doc usa `w-full max-w-md p-4`. Atual usa `Card` shadcn responsivo — compatível.

### 11. Acessibilidade

Doc: `Label htmlFor` + ícones decorativos. Atual: idem com `aria-*` do shadcn — igual ou superior.

### 12. Proposta de correção

Recomendo **manter o `/auth` do 360°FOOD** e classificar as diferenças como **Não aplicável** (identidade + arquitetura multi-tenant). Ajustes propostos, sujeitos a aprovação:

- **G01-FIX-01** — Documentar oficialmente no `.lovable/dp-diagnostico.md` que o login DP é o `/auth` global (sem CPF), e que redirecionamento DP acontece em `RootGate`. Sem código.
- **G01-FIX-02** — (Opcional) Adicionar redirecionamento pós-login que preserve o parâmetro `?redirect=/dp/meu`. Já existe via `safeRedirect` — apenas validar link.
- **G01-FIX-03** — Revisar necessidade de signup público para colaboradores DP: se a regra é “colaborador só é criado por admin via `dp-invite-colaborador`”, garantir mensagem clara no `/auth` quando um e-mail de colaborador tentar signup. **Precisa de decisão de regra de negócio.**

### 13. Critérios de aceite

- Colaborador com vínculo em `dp_colaboradores` e login válido é redirecionado para `/dp/meu` sem passar pelo Hub financeiro.
- Admin/owner é redirecionado para `/hub`, mesmo com vínculo residual em `dp_colaboradores`.
- Signup público bloqueado ou avisado quando o e-mail pertence a `dp_colaboradores` sem `user_id` associado (a validar em auditoria específica).

### 14. Decisão necessária

Nenhuma alteração foi realizada. Aguardando aprovação das correções propostas para esta tela.
Opções: `APROVAR TODAS (G01)` · `APROVAR PARCIAL (informar IDs)` · `REVISAR` · `REJEITAR` · `AVANÇAR SEM CORRIGIR`.

---

## DP-G02 — Shell global e navegação

### 1. Identificação

- Perfil de acesso: colaborador (`ColaboradorShell`) e admin (`DpLayout`/`DpShell`).
- Arquivo de referência: `src/components/AppShell.tsx` (único shell, condicional por `isAdmin`).
- Arquivos atuais:
  - `src/components/dp/DpLayout.tsx`
  - `src/components/dp/DpShell.tsx`
  - `src/components/dp/DpSidebar.tsx`
  - `src/components/dp/DpHeader.tsx`
  - `src/components/dp/ColaboradorShell.tsx`
  - `src/components/layout/sidebar-menus/DpMenu.tsx` (sidebar antigo/legado no Hub financeiro)
- Objetivo: fornecer navegação, cabeçalho, notificações e bloco de identificação do usuário para todo o módulo DP.
- Status geral: **Parcialmente conforme**.
- Aderência estimada: 65%.

### 2. Estrutura esperada (doc)

- **Header mobile fixo** com logo, título “Portal do Colaborador” e botão hambúrguer.
- **Aside** lateral (`w-64`) que colapsa em mobile via `translate-x-full`, com overlay `bg-black/20`.
- **Bloco de logo desktop** com logo circular + nome + subtítulo.
- **Nav principal** com item “Início” destacado (bg `red-600 text-white`) e grupos expansíveis:
  - Admin: `Cadastro`, `Folgas`, `Documentos`, `Comunicação` (cada um é `NavLink` para hub + botão chevron que abre subitens).
  - Colaborador: link direto `Meu Cadastro`, grupos estáticos `Folgas` e `Documentos` (sempre abertos).
- **Rodapé fixo** com `profile.nome`, cargo/`Administrador`, e botão `Sair` destrutivo.
- **Área principal** com `NotificationBell` alinhado à direita + `AvisosPopout` global.
- Somente **um** grupo expansível aberto por vez (toggle exclui os demais).
- Menus expandem automaticamente quando a rota bate no prefixo.
- Ícones da doc: `Home, Users, Briefcase, Building2, Scale, Calendar, ClipboardList, UserCheck, ArrowLeftRight, Ban, FileText, FileWarning, ShieldAlert, MessageSquare, Bell, Coins, ListChecks, Megaphone, Settings, LogOut, Menu, X, ChevronDown, ChevronRight`.

### 3. Estrutura encontrada

- `DpLayout`/`DpShell`: usa `SidebarProvider` do shadcn, `DpSidebar` (colapsável `icon`), `DpHeader` (`SidebarTrigger`, `ContextSelector` PF/PJ, `FavoriteToggle`, `DpNotificacoesBell`), `AvisosPopout` global.
- Identidade visual: logo 360°FOOD (assinatura vs símbolo por estado colapsado), subtítulo “DP 360°” (admin) / “Portal do Colaborador” (portal).
- `DpSidebar` (admin): links `Início` + grupos `Cadastro`, `Folgas`, `Documentos`, `Comunicação` (mesma hierarquia da doc). Rodapé com link “Voltar ao Hub”, e-mail do usuário, rótulo Administrador/Colaborador, botão “Sair”.
- `DpSidebar` (portal): `Início`, `Perfil`, `Calendário`, `Histórico`, grupos `Folgas` (Solicitações/Atestados/Trocas), `Documentos` (Meus Documentos/Disciplinar/Meu Sindicato).
- Múltiplos grupos podem ficar abertos simultaneamente (`open` local por grupo), diferente da doc.
- `ColaboradorShell` renderiza portal usando `DpShell variant="portal"` (mesmo shell).
- `DpMenu` legado ainda existe em `src/components/layout/sidebar-menus/DpMenu.tsx` com árvore diferente (Operação/Comunicação/Compliance/Folha/Cadastros) — potencialmente visível pelo sidebar do Hub financeiro.

### 4. Matriz de divergências

| ID | Categoria | Elemento | Esperado | Encontrado | Status | Gravidade |
|---|---|---|---|---|---|---|
| DIV-G02-01 | Layout | Header mobile | Header próprio com logo + hambúrguer | `SidebarTrigger` shadcn dentro do header desktop | Divergente | Média |
| DIV-G02-02 | Navegação | Toggle exclusivo | Apenas 1 grupo aberto por vez | Cada grupo abre independente | Divergente | Baixa |
| DIV-G02-03 | Navegação | Botão do grupo | Grupo é `NavLink` que navega ao hub + chevron separado abre subitens | Botão único navega ao hub e faz toggle simultâneo | Parcialmente conforme | Baixa |
| DIV-G02-04 | Rodapé | Nome do usuário | `profile.nome` + `cargo` | `user.email.split('@')[0]` + rótulo genérico | Divergente | Média — falta puxar `dp_colaboradores.nome`/`cargo` |
| DIV-G02-05 | Menu admin | Portal Folgas | Grupo Folgas contém: Calendário Geral, Solicitações, Aprovações, Trocas, Datas Bloqueadas | Igual | Conforme | — |
| DIV-G02-06 | Menu admin | Grupo Documentos | Contracheques, Adiantamentos, Folhas de Ponto, Atestados, Registros Disciplinares, ACT-CCT, Histórico Completo | Igual + extras “Importar em massa” | Extra | Baixa |
| DIV-G02-07 | Menu admin | Grupo Comunicação | Mensagens, Quadro de Avisos | Igual + `Central de Comunicação` + `Modelos de Mensagem` | Extra | Baixa |
| DIV-G02-08 | Menu portal | Estrutura | Grupos estáticos (não colapsáveis) na doc | Grupos colapsáveis no atual | Divergente | Baixa |
| DIV-G02-09 | Menu portal | Meu Cadastro | Doc: `Meu Cadastro` (ícone `Settings`) leva a `/perfil` | Atual: `Perfil` (ícone `User`) | Divergente — texto e ícone | Baixa |
| DIV-G02-10 | Menu portal | Ordem de itens | Doc: Meu Cadastro → grupo Folgas (Calendário, Trocas, Histórico) → grupo Documentos (Meus Documentos, Atestados, Disciplinar, Sindicato) | Atual: Início → Perfil → Calendário → Histórico → grupo Folgas (Solicitações, Atestados, Trocas) → grupo Documentos (Meus Documentos, Disciplinar, Meu Sindicato) | Divergente | Média |
| DIV-G02-11 | Menu portal | Item “Atestados” | Doc: dentro de Documentos | Atual: dentro de Folgas | Divergente | Média |
| DIV-G02-12 | Header | Notificações | `NotificationBell` posicionado dentro do `main`, canto superior direito | `DpNotificacoesBell` dentro do header sticky | Divergente | Baixa (melhoria) |
| DIV-G02-13 | Header | ContextSelector | Não existe na doc | Atual mostra `ContextSelector` PF/PJ no admin | Extra | Baixa — específico do 360°FOOD |
| DIV-G02-14 | Header | Favoritos | Doc não tem toggle de favorito no header (usa `FavoritarBotao` inline em cards) | Atual tem `FavoriteToggle` no header | Extra | Baixa |
| DIV-G02-15 | Popouts globais | `AtestadosPendentesPopout` + `AvisosPopout` | Ambos globais | Somente `AvisosPopout` no shell; `AtestadosPendentesPopout` está apenas em `DpHome` | Parcialmente conforme | Média |
| DIV-G02-16 | Sidebar duplicado | 1 shell na doc | 2 sidebars (`DpSidebar` novo + `DpMenu` legado no Hub financeiro) | Divergente | Média — risco de expor menu antigo |
| DIV-G02-17 | Guard | Portal | Portal na doc protegido apenas por `isAuthenticated`; atual `PortalProtected` idem | Conforme | Baixa |
| DIV-G02-18 | Guard | Portal DP | Doc não tem guard de módulo/assinatura (mono-tenant) | Atual portal não usa `ModuleGuard`/`SubscriptionGuard` | Não aplicável / **precisa decisão de regra** | Média |
| DIV-G02-19 | Contraste | Item Início | Doc: `bg-red-600 text-white font-bold` | Atual: `bg-primary text-primary-foreground font-semibold` | Não aplicável (identidade), semântica preservada | — |
| DIV-G02-20 | Acessibilidade | Botão do grupo | Doc tem `aria-label="Fechar/Abrir menu"` no chevron | Atual não expõe `aria-label` explícito | Divergente | Baixa |

### 5. Divergências de layout

Grid: doc usa `flex flex-col md:flex-row` com `aside w-64`; atual usa `SidebarProvider` shadcn (comportamento equivalente com melhor DX). **Nenhuma quebra visual detectada estruturalmente**. Cores foram adaptadas aos tokens 360°FOOD.

### 6. Divergências funcionais

- Toggle exclusivo (DIV-G02-02).
- Portal com grupos colapsáveis onde doc usa estáticos (DIV-G02-08).
- Falta de `AtestadosPendentesPopout` global (DIV-G02-15).
- Nome e cargo do usuário não vêm de `dp_colaboradores` (DIV-G02-04).

### 7. Formulários

Não aplicável.

### 8. Diálogos / Popouts

- Doc: `NotificationBell` (dropdown/dialog), `AvisosPopout`, `AtestadosPendentesPopout` — todos globais no shell.
- Atual: `DpNotificacoesBell` (equivalente), `AvisosPopout` global, `AtestadosPendentesPopout` **não** montado no shell — precisa mover.

### 9. Estados

Estados de sidebar aberta/colapsada preservados. Loading do `AuthProvider` idêntico em ambos.

### 10. Responsividade

Doc explicita `top-[56px]`/`h-[calc(100vh-56px)]` em mobile. Atual delega ao componente shadcn (`Sheet` interno). Precisa validação visual em 360/390 px em rodada específica.

### 11. Acessibilidade

- Doc: `aria-label` no botão hambúrguer e no chevron do grupo, foco visível padrão do browser.
- Atual: `SidebarTrigger` já expõe `aria-label`; falta `aria-label` nos botões de grupo do `DpSidebar` (DIV-G02-20).

### 12. Proposta de correção

- **G02-FIX-01** — Alinhar ordem e agrupamento do menu **portal** com a doc: `Meu Cadastro` → grupo Folgas (`Calendário`, `Trocas`, `Histórico`) → grupo Documentos (`Meus Documentos`, `Atestados`, `Disciplinar`, `Sindicato`). Renomear item `Perfil` para `Meu Cadastro`. Mover `Atestados` para o grupo Documentos. Manter “Solicitações” como extra (não existe na doc) ou avaliar remoção. Arquivo: `src/components/dp/DpSidebar.tsx`.
- **G02-FIX-02** — Tornar grupos do portal estáticos (sem chevron) para bater com a doc. Mesmo arquivo.
- **G02-FIX-03** — Aplicar toggle **exclusivo** aos grupos do admin. Mesmo arquivo.
- **G02-FIX-04** — Puxar `profile.nome` e `profile.cargo` de `dp_colaboradores` no rodapé do sidebar em vez de `user.email`. Requer novo hook leve (`useDpMeuPerfilResumido`) ou reaproveitar `useDpColaboradores` filtrando por `user_id`. Arquivos: `src/components/dp/DpSidebar.tsx` + eventual novo hook.
- **G02-FIX-05** — Montar `AtestadosPendentesPopout` no `DpShell` para admin (hoje só aparece na `DpHome`). Arquivo: `src/components/dp/DpShell.tsx`.
- **G02-FIX-06** — Adicionar `aria-label` (`Abrir menu {nome}` / `Fechar menu {nome}`) nos botões de grupo do sidebar. Arquivo: `src/components/dp/DpSidebar.tsx`.
- **G02-FIX-07** — Desativar/remover `src/components/layout/sidebar-menus/DpMenu.tsx` após confirmar que não há mais consumidor, evitando exposição do menu legado. Arquivo: pesquisa por `DpMenu` antes.
- **G02-FIX-08** — Corrigir URL do menu “Atestados” do sidebar admin (hoje aponta para `/dp/documentos/atestado` inexistente) para `/dp/atestados` ou renomear a rota de acordo com a arquitetura escolhida (ver DIV-INV-04). Arquivo: `src/components/dp/DpSidebar.tsx`.
- **G02-FIX-09** — Decidir se `PortalProtected` deve exigir `ModuleGuard("dp")` e `SubscriptionGuard` — **exige decisão de negócio**.

### 13. Critérios de aceite

- Portal exibe menu na ordem: Meu Cadastro / Folgas (Calendário, Trocas, Histórico) / Documentos (Meus Documentos, Atestados, Disciplinar, Sindicato).
- Ao expandir um grupo do admin, os demais fecham.
- Rodapé do sidebar mostra o nome cadastrado em `dp_colaboradores` e o cargo real.
- `AtestadosPendentesPopout` é visível em qualquer rota `/dp/*` do admin.
- Nenhum link do sidebar leva a 404.
- Botões de grupo têm `aria-label` legível por leitor de tela.
- `DpMenu` legado não é mais renderizado em nenhum shell.

### 14. Decisão necessária

Nenhuma alteração foi realizada. Aguardando aprovação das correções propostas para esta tela.
Opções: `APROVAR TODAS (G02)` · `APROVAR PARCIAL (informar IDs)` · `REVISAR` · `REJEITAR` · `AVANÇAR SEM CORRIGIR`.

---

## Oportunidades de melhoria — fora do escopo de aderência

- Padronizar hook `useDpMeuPerfil` para uso em Shell + páginas do portal (evitaria fetches duplicados).
- Extrair `NotificationBell`/`Popouts` para um provider dedicado (`DpNotificationsProvider`) — reduziria acoplamento com `DpShell`.
- Testes Playwright básicos para navegação portal↔admin.

Nenhuma dessas melhorias será implementada automaticamente.

---

## Mapa consolidado das telas DP × prompt mestre

| ID | Doc | Atual | 1ª leitura |
|---|---|---|---|
| DP-G00 | — | Inventário | **Auditado nesta rodada** |
| DP-G01 | `/login` | `/auth` | **Auditado** — divergência arquitetural aceita |
| DP-G02 | Shell + Sidebar | `DpShell`/`DpSidebar` | **Auditado** — 20 divergências, 8 correções propostas |
| DP-G03 | Componentes globais | `components/dp/*` + `components/ui/*` | Pendente |
| DP-C01 | `/home` | `/dp/meu` | Pendente |
| DP-C02 | `/perfil` | `/dp/meu/perfil` | Pendente |
| DP-C03 | `/calendario` | `/dp/meu/calendario` | Pendente |
| DP-C04 | `/trocas` | `/dp/meu/trocas` | Pendente |
| DP-C05 | `/historico` | `/dp/meu/historico` | Pendente |
| DP-C06 | `/documentos` | `/dp/meu/documentos` | Pendente |
| DP-C07 | `/documentos/atestados` | `/dp/meu/atestados` | Pendente |
| DP-C08 | `/documentos/disciplinar` | `/dp/meu/disciplinar` | Pendente |
| DP-C09 | `/documentos/sindicato` | `/dp/meu/sindicato` | Pendente |
| DP-A01 | `/admin/home` | `/dp` | Pendente |
| DP-A02 | `/admin/cadastro` | `/dp/cadastros` | Pendente |
| DP-A03 | `/admin/colaboradores` | `/dp/colaboradores` | Pendente |
| DP-A04 | `/admin/cargos` | `/dp/cadastros/cargos` | Pendente |
| DP-A05 | `/admin/unidades` | `/dp/cadastros/unidades` | Pendente |
| DP-A06 | `/admin/cadastro/sindicatos` + `/admin/documentos/act-cct` | `/dp/cadastros/sindicatos` + `/dp/documentos/act-cct` | Pendente |
| DP-A07 | `/admin/folgas` (dashboard) | `/dp/folgas` (`DpFolgasHub`) | Pendente — **gap potencial** |
| DP-A08 | `/admin/calendario` | `/dp/calendario` + `/dp/folgas/calendario` | Pendente — **verificar duplicidade DIV-INV-01** |
| DP-A09 | `/admin/solicitacoes` | `/dp/solicitacoes` | Pendente |
| DP-A10 | `/admin/aprovacoes` | `/dp/aprovacoes` | Pendente |
| DP-A11 | `/admin/trocas` | `/dp/trocas` | Pendente |
| DP-A12 | `/admin/bloqueios` | `/dp/bloqueios` | Pendente |
| DP-A13 | `/admin/documentos` | `/dp/documentos` | Pendente |
| DP-A14 | `/admin/documentos/contracheque` | `/dp/documentos/contracheque` | Pendente |
| DP-A15 | `/admin/documentos/adiantamento` | `/dp/documentos/adiantamento` | Pendente |
| DP-A16 | `/admin/documentos/ponto` | `/dp/documentos/ponto` | Pendente |
| DP-A17 | `/admin/documentos/historico` | `/dp/documentos/historico` | Pendente |
| DP-A18 | `/admin/documentos/atestados` | `/dp/atestados` | Pendente |
| DP-A19 | `/admin/documentos/disciplinar` | `/dp/disciplinar` | Pendente |
| DP-A20 | `/admin/documentos/act-cct` | `/dp/documentos/act-cct` | Pendente |
| DP-A21 | `/admin/comunicacao` | `/dp/comunicacao` | Pendente |
| DP-A22 | `/admin/mensagens` | `/dp/mensagens` + `/dp/modelos-mensagem` | Pendente |
| DP-A23 | `/admin/avisos` | `/dp/avisos` | Pendente |
| DP-A24 | `/setup` + `/admin/setup` | não aplicável (fluxo global) | Pendente |
| Importação | `DocumentImportForm` | `DpDocImportBulk` | Pendente |
| DP-X01..X06 | — | — | Pendente |

Próximo passo sugerido: **DP-C01 — Início do colaborador** (`/dp/meu`) após aprovação desta rodada.

---

> Auditoria inicial concluída. Nenhuma alteração foi realizada. Aguardando aprovação para corrigir os itens identificados ou avançar para a primeira tela do portal do colaborador.
