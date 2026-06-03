# Link Backoffice no Sidebar (apenas super_admin)

## Objetivo
Exibir um link de navegação "Backoffice" no AppSidebar para usuários com a role `super_admin`, permitindo acesso rápido ao painel administrativo sem precisar digitar a URL.

## Escopo
Alteração pontual no componente `AppSidebar`. O hook `useSuperAdmin` já existe e a rota `/admin` já está protegida por `SuperAdminRoute`.

## Implementação
1. **Importar** o hook `useSuperAdmin` e o ícone `Shield` (Lucide) em `src/components/layout/AppSidebar.tsx`.
2. **Adicionar** um novo item de menu "Backoffice" (url: `/admin`, ícone: `Shield`) na seção "Gerenciar" do sidebar.
3. **Renderizar condicionalmente** esse item apenas quando `isSuperAdmin === true`.
4. **Estilo**: manter o padrão existente (transição `hover:translate-x-1`, classes de active state, etc.).

## Fora de escopo
- Nenhuma alteração de backend, RLS, ou rotas.
- Nenhuma mudança no AdminSidebar ou nas páginas admin.