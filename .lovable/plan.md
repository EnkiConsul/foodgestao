## Objetivo

Nova página no backoffice para **gestão de cadastros de clientes**, mostrando todos os dados cadastrais em detalhe, permitindo editar informações e reenviar o e-mail de confirmação de cadastro para usuários que ainda não confirmaram.

## Escopo

### 1. Nova página `/admin/cadastros`
- Rota adicionada em `src/App.tsx` dentro do bloco `AdminLayout`.
- Item no menu do admin (sidebar) apontando para "Cadastros".
- Página `src/pages/admin/Cadastros.tsx` com listagem completa dos clientes cadastrados.

### 2. Listagem principal
Tabela com filtros/busca (nome, e-mail, documento, telefone) e colunas:
- Nome completo, Tipo (PF/PJ), E-mail, Documento (CPF/CNPJ), Telefone
- **Status do e-mail**: "Confirmado" ou "Pendente" (usando `auth.users.email_confirmed_at`)
- Onboarding, Cadastro (data), Ações

Ações por linha:
- **Ver / Editar** → abre painel lateral (Sheet) com todos os dados
- **Reenviar e-mail de confirmação** (habilitado apenas quando e-mail não confirmado)
- **Copiar e-mail**

### 3. Painel de edição (Sheet lateral)
Mostra e permite editar campos de `profiles`:
- `full_name`, `phone`, `document`, `profile_type`, `currency`, `timezone`
- Dados do `auth.users`: e-mail (readonly), status de confirmação, último login, criado em
- Dados de `onboarding_data` (JSON) exibidos em seção somente-leitura estruturada
- Empresas vinculadas (`companies`) listadas em resumo

Botões: **Salvar**, **Reenviar confirmação**, **Fechar**.

### 4. Reenvio de e-mail de confirmação
- Nova Edge Function `admin-resend-confirmation`:
  - Valida chamador via `is_super_admin`
  - Recebe `user_id`
  - Usa `supabaseAdmin.auth.admin.generateLink({ type: 'signup', email })` para gerar novo link
  - Dispara pelo `auth-email-hook` existente (template `signup` já traduzido 360°FOOD) via `enqueue_email` no queue `auth_emails`
  - Registra em `audit_logs` (`action: 'resend_confirmation_email'`)

### 5. Backend
- Edge Function `admin-list-users-auth`: retorna dados combinados `profiles` + `auth.users` (email, email_confirmed_at, last_sign_in_at) — necessário porque cliente não acessa `auth.users` diretamente. Protegida por `is_super_admin`.
- Edge Function `admin-update-profile`: atualiza campos de `profiles` com validação e escreve `audit_logs`. (Alternativa: aproveitar RLS existente de super admin em `profiles` — usar cliente direto e ficar só com a Edge Function para reenvio + listagem de auth.)

Decisão: usar **RLS existente** para salvar edição (`profiles` já tem policy super admin update). Criar apenas duas Edge Functions:
1. `admin-list-users-auth` (listagem enriquecida)
2. `admin-resend-confirmation` (reenvio)

### 6. Relação com `Clientes`
A página atual `/admin/clientes` continua existindo (visão resumida com plano/isenção/status). A nova `/admin/cadastros` foca em **dados cadastrais e ciclo de confirmação**. Um link cruzado entre as duas nos headers.

## Detalhes técnicos

- Rota: `<Route path="/admin/cadastros" element={<AdminCadastros />} />` em `src/App.tsx`.
- Menu admin: adicionar item em `AdminLayout` (sidebar) — "Cadastros" com ícone `UserCog`.
- Página usa `useQuery(['admin-cadastros'])` chamando `supabase.functions.invoke('admin-list-users-auth')`.
- Sheet de edição usa `react-hook-form` + `zod` com schema em `src/lib/validations.ts` (`adminEditProfileSchema`).
- Reenvio: mutation → invoke `admin-resend-confirmation` → toast success/erro e refetch.
- Edge Functions criadas com corsHeaders, validação Zod do body, verificação `is_super_admin` via `auth.getUser()` + rpc.

## Fora do escopo
- Não altera fluxo de auth ou template de confirmação (já existente e customizado 360°FOOD).
- Não expõe senhas nem tokens ao frontend.
- Sem alterações em `Clientes` além de link cruzado.

## Diagrama de fluxo (reenvio)

```text
Admin clica "Reenviar" 
  → invoke admin-resend-confirmation({ user_id })
  → EF valida super_admin
  → EF chama auth.admin.generateLink(signup, email)
  → EF enqueue_email(auth_emails, template=signup, action_link)
  → process-email-queue envia
  → audit_logs registra evento
```
