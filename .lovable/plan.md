## Objetivo

Tornar o módulo **Gestão de Usuários** completo para empresas (PJ): convidar membros, definir permissões granulares por módulo e disparar o convite por e-mail automaticamente.

## 1. Modelo de permissões

Cada membro tem um **papel base** (controla a UI de Gestão de Usuários):
- **Dono** — acesso total, não pode ser editado/removido
- **Admin** — gerencia membros e dados
- **Membro** — opera os módulos liberados
- **Visualizador** *(novo)* — somente leitura nos módulos liberados

Sobre o papel base, cada membro tem um conjunto de **permissões por módulo** (jsonb) com 3 níveis:
`none` (não vê o item no menu) · `view` (só lê) · `edit` (lê e modifica).

Módulos controláveis:
- Dashboard
- Lançamentos (Contas a Pagar/Receber)
- Contas Bancárias
- Categorias
- Contatos
- Formas de Pagamento
- Orçamento
- Relatórios
- Fluxo de Caixa
- Anexos
- Gestão de Usuários (sempre limitado a Dono/Admin)

Padrões aplicados ao convidar:
- Admin → tudo `edit`
- Membro → Lançamentos/Contas/Categorias/Contatos/Formas/Anexos = `edit`; Relatórios/Fluxo/Orçamento = `view`; Dashboard = `view`
- Visualizador → tudo `view` (Gestão de Usuários `none`)
Dono mantém implícito acesso total e ignora o jsonb.

## 2. Backend (Lovable Cloud)

**Migration:**
- Adicionar valor `viewer` ao enum `company_role`
- Adicionar coluna `permissions jsonb NOT NULL DEFAULT '{}'` em `company_members` e `company_invites`
- Função `public.get_member_permission(_user_id uuid, _company_id uuid, _module text) RETURNS text` (SECURITY DEFINER) devolvendo `edit`/`view`/`none`, com `owner` sempre `edit`
- Função `public.can_edit_company(_user_id uuid, _company_id uuid, _module text) RETURNS boolean`
- Ajustar políticas RLS de write nas tabelas operacionais (`transactions`, `accounts`, `categories`, `contacts`, `payment_methods`, `budgets`, `transaction_attachments`) para exigir `can_edit_company` no módulo correspondente quando `company_id` estiver setado. SELECT continua liberado para qualquer membro.

**Edge Functions:**
- `accept-invite` passa a copiar `invite.permissions` ao criar a linha em `company_members`.
- Nova função `send-company-invite-email` (ou reuso do pipeline de e-mail transacional) é chamada automaticamente após `INSERT` em `company_invites`, enviando o link `/convite/{token}` ao convidado.

**Pré-requisitos de e-mail:** se o projeto ainda não tiver domínio + infraestrutura de Lovable Emails configurada, o usuário será guiado pelo diálogo de setup antes do template ser criado e implantado (`auth` permanece como está).

## 3. Frontend

**`src/lib/permissions.ts` (novo)**
- Tipos `ModuleKey`, `PermissionLevel`, mapa de presets por papel
- Hook `useCompanyPermissions(companyId)` que lê `company_members` do usuário logado e devolve `{ can(module, level) }`
- Helper `getDefaultPermissions(role)`

**Sidebar & rotas**
- `AppSidebar` filtra itens usando `can(module, 'view')`
- Guardas (botões "Novo", forms) desabilitados quando `can(module, 'edit') === false`, com tooltip "Acesso somente leitura"

**`InviteUserDialog`**
- Adiciona papel **Visualizador** no select
- Nova seção "Permissões por módulo" com tabela: cada módulo + radio (Sem acesso / Visualizar / Editar)
- Pré-preenche conforme o papel escolhido; usuário pode customizar antes de enviar
- Ao salvar, persiste `permissions` no insert e o trigger de e-mail dispara o convite

**`GestaoUsuarios`**
- Linha do membro ganha ação **Editar permissões** (mesma UI da seção do convite)
- Badge de papel inclui Visualizador
- Listagem de convites mostra status "E-mail enviado" quando aplicável e mantém botão de copiar link

## 4. Detalhes técnicos

```text
company_members
├── role: owner | admin | member | viewer
└── permissions: { "transactions": "edit", "reports": "view", ... }

company_invites
├── role + permissions (mesmo shape)
└── trigger AFTER INSERT → pg_net.http_post → send-company-invite-email
```

- Owner é determinístico: ignora `permissions`.
- Frontend nunca confia só na UI; toda escrita sensível é validada por RLS via `can_edit_company`.
- O e-mail do convite usa o template já existente do pipeline Lovable Emails (assunto: "Você foi convidado para [Empresa] no Gestor Plin").

## 5. Validação

1. Convidar usuário como Visualizador → ele entra, vê dados mas todos os botões "Novo/Editar/Excluir" ficam desabilitados.
2. Convidar como Membro restringindo Relatórios para `none` → item some do menu para esse usuário.
3. Convidado recebe e-mail automaticamente com link `/convite/{token}` funcional.
4. Admin original altera permissões de um membro existente e a mudança reflete sem novo convite.
5. Tentativa de `UPDATE` direta via Supabase a uma tabela bloqueada retorna erro de RLS.
