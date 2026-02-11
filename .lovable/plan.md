

# Modulo de Gestao de Usuarios (Multi-usuarios por Empresa)

## Objetivo
Permitir que o dono de uma empresa convide outros usuarios para compartilhar os dados financeiros da mesma empresa. Cada membro tera um papel (admin ou membro) que define suas permissoes.

## Arquitetura

### Novas tabelas no banco de dados

1. **`company_members`** - Vincula usuarios a empresas com papel
   - `id` (uuid, PK)
   - `company_id` (uuid, FK -> companies)
   - `user_id` (uuid, NOT NULL)
   - `role` (enum: `owner`, `admin`, `member`)
   - `created_at`, `updated_at`
   - Constraint UNIQUE em (company_id, user_id)

2. **`company_invites`** - Convites pendentes
   - `id` (uuid, PK)
   - `company_id` (uuid, FK -> companies)
   - `invited_email` (text, NOT NULL)
   - `role` (enum: `admin`, `member`)
   - `invited_by` (uuid, NOT NULL)
   - `status` (enum: `pending`, `accepted`, `rejected`, `expired`)
   - `token` (text, UNIQUE) - token para aceitar convite
   - `expires_at` (timestamptz)
   - `created_at`

### Enum do banco
```text
company_role: 'owner' | 'admin' | 'member'
invite_status: 'pending' | 'accepted' | 'rejected' | 'expired'
```

### Funcao security definer
- `is_company_member(user_id, company_id)` - verifica se o usuario pertence a empresa
- `get_company_role(user_id, company_id)` - retorna o papel do usuario na empresa

### RLS Policies
- `company_members`: membros podem ver outros membros da mesma empresa; apenas owner/admin podem inserir/remover
- `company_invites`: apenas owner/admin da empresa podem criar/ver convites
- Quando o usuario selecionar contexto de empresa, as tabelas existentes (`accounts`, `transactions`, `bills`, etc.) que possuem `company_id` deverao respeitar o acesso via `company_members`

### Auto-inserir owner
- Trigger: ao criar uma empresa, inserir automaticamente o criador como `owner` em `company_members`

## Novos arquivos

### 1. `src/pages/GestaoUsuarios.tsx`
Pagina principal do modulo com:
- Seletor de empresa (se o usuario tem mais de uma)
- Lista de membros atuais com nome, e-mail, papel e data de entrada
- Lista de convites pendentes com status
- Botao para convidar novo membro
- Acoes: alterar papel, remover membro, cancelar convite

### 2. `src/components/users/InviteUserDialog.tsx`
Dialog para enviar convite:
- Campo de e-mail
- Selecao de papel (admin ou membro)
- Ao salvar, insere na tabela `company_invites` com token gerado

### 3. `src/pages/AcceptInvite.tsx`
Pagina publica acessivel via link com token:
- Verifica se o convite e valido e nao expirou
- Se o usuario ja tem conta, aceita o convite e cria o registro em `company_members`
- Se nao tem conta, redireciona para cadastro e depois aceita

## Arquivos a modificar

### 4. `src/App.tsx`
- Adicionar rota `/gestao-usuarios` (protegida)
- Adicionar rota `/convite/:token` (publica, para aceitar convites)

### 5. `src/components/layout/AppSidebar.tsx`
- Adicionar item "Usuarios" no grupo "Gerenciar" com icone `Users`

## Fluxo do convite

1. Owner/Admin acessa "Gestao de Usuarios" e clica "Convidar"
2. Preenche e-mail e papel, salva
3. Registro criado em `company_invites` com token unico e validade de 7 dias
4. (Futuro: envio de e-mail com link - por ora, o link sera exibido para copiar)
5. Convidado acessa o link `/convite/:token`
6. Se logado, aceita e e adicionado a `company_members`
7. Se nao logado, redireciona para login/cadastro e depois aceita

## Detalhes tecnicos

### Migracao SQL
- Criar enum `company_role` e `invite_status`
- Criar tabelas `company_members` e `company_invites`
- Criar funcoes `is_company_member` e `get_company_role` (security definer)
- Criar trigger para auto-inserir owner ao criar empresa
- Criar RLS policies para as novas tabelas
- Inserir registros em `company_members` para empresas ja existentes (o `user_id` da empresa vira `owner`)

### Interface
- Segue o padrao visual das paginas existentes (cards, badges, filtros)
- Badges de papel: Owner (roxo), Admin (azul), Membro (cinza)
- Confirmacao antes de remover membro
- Toast de sucesso/erro em todas as acoes

