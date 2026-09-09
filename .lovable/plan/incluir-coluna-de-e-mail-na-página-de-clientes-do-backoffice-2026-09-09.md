# Incluir coluna de e-mail na página de Clientes do backoffice

## Objetivo
Na tela `/admin/clientes` (componente `AdminUsers`), exibir o e-mail cadastrado de cada cliente em uma coluna própria, tanto na visualização desktop quanto no card mobile.

## Alterações previstas

### 1. Fonte de dados
- Substituir a consulta direta à tabela `profiles` no `AdminUsers.tsx` por uma chamada à Edge Function `admin-list-users-auth`.
- Essa função já retorna todos os campos de `profiles` mais o objeto `auth` contendo `email`, `phone`, `email_confirmed_at`, `last_sign_in_at` e `created_at`.

### 2. Tipo da linha
- Definir um tipo local `AdminUserRow` equivalente ao retorno da Edge Function, com `auth?: { email?: string | null; ... } | null`.

### 3. Coluna E-mail (desktop)
- Inserir `<TableHead>E-mail</TableHead>` após a coluna "Nome".
- Renderizar `<TableCell className="text-muted-foreground">{user.auth?.email ?? "—"}</TableCell>` na linha correspondente.

### 4. Card mobile
- Adicionar o e-mail abaixo do nome, com estilo `text-muted-foreground` e `truncate`.

### 5. Busca
- Incluir `user.auth?.email` no termo de busca, permitindo filtrar clientes por e-mail.

### 6. Skeletons e estado vazio
- Atualizar o número de colunas nos skeletons de loading (`colSpan={8}` no desktop, pois haverá oito colunas).
- Revisar o `Array.from({ length: 7 })` dos skeletons para refletir a nova quantidade.

## Escopo
- Apenas alterações no front-end, no componente `src/components/admin/AdminUsers.tsx`.
- Nenhuma mudança de banco de dados, Edge Function ou backend.

## Validação
- Typecheck (`tsgo` ou `bunx tsc --noEmit`) deve passar.
- A página `/admin/clientes` deve exibir a coluna "E-mail" com os valores corretos e permitir busca por e-mail.
