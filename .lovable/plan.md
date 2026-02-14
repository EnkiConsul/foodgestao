
# Modulo de Administracao da Plataforma (Super Usuario)

## Resumo

Criar um painel administrativo completo, acessivel exclusivamente por super usuarios, para gerenciar todos os usuarios e perfis de acesso da plataforma, com estatisticas gerais.

---

## Etapas de Implementacao

### 1. Banco de Dados - Tabela de Papeis (user_roles)

Criar a infraestrutura de seguranca no banco de dados:

- **Tipo enum** `app_role` com valores: `super_admin`, `admin`, `user`
- **Tabela** `user_roles` com colunas: `id`, `user_id` (referencia `auth.users`), `role` (tipo `app_role`), constraint unique em `(user_id, role)`
- **RLS** habilitado na tabela `user_roles`:
  - Super admins podem ver todos os registros
  - Usuarios comuns podem ver apenas seu proprio papel
- **Funcao** `has_role(user_id, role)` com `SECURITY DEFINER` para verificar papeis sem recursao em RLS
- **Funcao** `is_super_admin(user_id)` com `SECURITY DEFINER` para verificacao rapida

O primeiro super admin sera inserido manualmente via SQL apos a migracao.

### 2. Politicas RLS para Dados Administrativos

Adicionar politicas nas tabelas existentes para permitir que super admins acessem todos os dados:

- **profiles**: super admins podem SELECT todos os perfis
- **companies**: super admins podem SELECT todas as empresas
- **transactions**: super admins podem SELECT todas as transacoes (para estatisticas)
- **accounts**: super admins podem SELECT todas as contas (para estatisticas)

### 3. Hook `useSuperAdmin`

Criar hook `src/hooks/useSuperAdmin.tsx` que:

- Consulta a tabela `user_roles` para verificar se o usuario logado possui o papel `super_admin`
- Retorna `{ isSuperAdmin, loading }`
- Utiliza React Query para cache eficiente

### 4. Pagina de Administracao

Criar `src/pages/Admin.tsx` com tres abas/secoes:

**Aba 1 - Estatisticas Gerais:**
- Total de usuarios cadastrados
- Total de perfis de acesso (pessoais e empresariais)
- Total de lancamentos na plataforma
- Cards visuais seguindo o mesmo padrao do Dashboard atual

**Aba 2 - Gestao de Usuarios:**
- Tabela com todos os usuarios da plataforma (nome, email, data de cadastro, status do onboarding)
- Busca por nome ou email
- Acoes: visualizar detalhes, ativar/desativar conta (futuro)

**Aba 3 - Perfis de Acesso:**
- Tabela com todos os perfis (empresas) criados na plataforma
- Filtros por tipo (pessoal/empresarial) e status (ativo/inativo)
- Visualizacao dos dados de cada perfil

### 5. Protecao de Rota

- Criar componente `SuperAdminRoute` que verifica o papel do usuario e redireciona para `/` caso nao seja super admin
- Adicionar a rota `/admin` no `App.tsx` protegida por esse componente

### 6. Navegacao

- Adicionar item "Administracao" no sidebar (`AppSidebar.tsx`) com icone `ShieldCheck`, visivel **somente** quando o usuario for super admin
- O item aparecera em uma nova secao separada no final do menu

---

## Detalhes Tecnicos

```text
Estrutura de arquivos:

src/
  hooks/
    useSuperAdmin.tsx        (novo - hook de verificacao)
  pages/
    Admin.tsx                (novo - painel admin)
  components/
    admin/
      AdminStats.tsx         (novo - cards de estatisticas)
      AdminUsers.tsx         (novo - tabela de usuarios)
      AdminCompanies.tsx     (novo - tabela de perfis)
      SuperAdminRoute.tsx    (novo - guard de rota)

supabase/
  migrations/
    xxx_create_user_roles.sql  (novo - migracao)
```

**Fluxo de seguranca:**

```text
Usuario acessa /admin
  -> SuperAdminRoute verifica user_roles no banco
    -> Se super_admin: renderiza Admin.tsx
    -> Se nao: redireciona para /
```

**Importante:** A verificacao de papel e feita sempre no servidor (via RLS e funcoes `SECURITY DEFINER`), nunca apenas no cliente. O hook `useSuperAdmin` consulta o banco, e as politicas RLS garantem que mesmo que alguem tente acessar dados diretamente, so super admins terao acesso.

### Atribuicao do primeiro Super Admin

Apos a migracao, sera necessario executar manualmente um SQL para definir o primeiro super admin:

```text
INSERT INTO public.user_roles (user_id, role)
VALUES ('<seu-user-id>', 'super_admin');
```

Esse comando sera disponibilizado para execucao no painel do backend.
