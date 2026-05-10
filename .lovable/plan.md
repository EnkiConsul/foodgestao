## Objetivo

Quando o Super Admin estiver no backoffice (`/admin`), o menu lateral deve ser totalmente diferente do menu dos clientes da plataforma — exibindo apenas as seções administrativas, sem os módulos do app (Dashboard, Lançamentos, Categorias etc.).

## Estado atual

- Existe um único `AppSidebar` usado em todo o app.
- O backoffice está concentrado em `/admin` como uma página única com **Tabs** (Estatísticas, Clientes, Planos, Assinaturas, Faturamento, Perfis de Acesso, Auditoria, Resetar Dados).
- Para Super Admin, o sidebar atual apenas adiciona um item "Administração" no final, mantendo todo o menu de cliente visível.

## Mudanças propostas

### 1. Novo `AdminSidebar` (backoffice)

Criar `src/components/layout/AdminSidebar.tsx` com identidade visual distinta (cabeçalho "Gestor Plin · Admin" + ícone `ShieldCheck`) e os seguintes itens, cada um com rota dedicada:

- Estatísticas → `/admin/estatisticas`
- Clientes → `/admin/clientes`
- Planos → `/admin/planos`
- Assinaturas → `/admin/assinaturas`
- Faturamento → `/admin/faturamento`
- Cupons → `/admin/cupons` (já existe `AdminCoupons.tsx`)
- Faturas → `/admin/faturas` (já existe `AdminInvoices.tsx`)
- Perfis de Acesso → `/admin/perfis-acesso`
- Auditoria → `/admin/auditoria`
- Resetar Dados → `/admin/resetar-dados`

Rodapé com:
- Botão "Voltar ao app" → `/`
- Botão "Sair"

### 2. Layout dedicado para o backoffice

Criar `src/components/layout/AdminLayout.tsx` (estrutura igual ao `AppLayout`, mas usando `AdminSidebar`). O `AppHeader` continua, com um badge "Backoffice" para deixar claro o contexto.

### 3. Rotas

Em `src/App.tsx`:
- Manter `SuperAdminRoute` como guard.
- Substituir a rota única `/admin` por um grupo aninhado usando `AdminLayout` + sub-rotas (uma por seção). A rota `/admin` redireciona para `/admin/estatisticas`.
- Remover as Tabs do `Admin.tsx` — cada conteúdo (`AdminStats`, `AdminUsers`, etc.) vira página própria simples renderizada pela rota.

### 4. Sidebar do cliente

Em `AppSidebar.tsx`, **remover** o grupo "Administração" (item para `/admin`), já que o acesso passa a ser feito via menu do usuário (avatar) no header.

### 5. Acesso ao backoffice no header

No `AppHeader`, dentro do dropdown do avatar, adicionar (somente quando `isSuperAdmin`) o item "Backoffice" com ícone `ShieldCheck` apontando para `/admin`. Isso mantém o menu do cliente limpo e separa contextos.

## Detalhes técnicos

- Reaproveitar componentes existentes em `src/components/admin/*` sem reescrita; cada um vira o conteúdo de uma página em `src/pages/admin/`.
- `AdminSidebar` segue o mesmo padrão visual do `AppSidebar` (tokens semânticos, `collapsible="icon"`, `translate-x-1` nos hovers/ativos) conforme memória de UX.
- Não alterar lógica de RBAC; o `SuperAdminRoute` já existente envolve o `AdminLayout`.
- Sem mudanças de banco de dados.

## Arquivos afetados

- Novo: `src/components/layout/AdminSidebar.tsx`
- Novo: `src/components/layout/AdminLayout.tsx`
- Novo: `src/pages/admin/{Estatisticas,Clientes,Planos,Assinaturas,Faturamento,Cupons,Faturas,PerfisAcesso,Auditoria,ResetarDados}.tsx` (wrappers finos)
- Editar: `src/App.tsx` (rotas)
- Editar: `src/components/layout/AppSidebar.tsx` (remover grupo Administração)
- Editar: `src/components/layout/AppHeader.tsx` (item "Backoffice" no dropdown do avatar)
- Remover/Reduzir: `src/pages/Admin.tsx` (substituído pelas novas páginas)
