## Mover Categorização IA para o Backoffice

Hoje a página `/categorizacao-ia` aparece no menu Financeiro (Cadastros) para qualquer usuário. Vamos restringi-la ao Backoffice (super admin).

### Mudanças

1. **`src/components/layout/sidebar-menus/FinanceiroMenu.tsx`**
   - Remover o item "Categorização IA" e o ícone `Brain` do import.

2. **`src/components/layout/AdminSidebar.tsx`**
   - Adicionar novo item `{ title: "Categorização IA", url: "categorizacao-ia", icon: Brain }` na seção apropriada do menu admin.

3. **`src/App.tsx`**
   - Remover a rota pública `/categorizacao-ia`.
   - Adicionar rota `/admin/categorizacao-ia` dentro do bloco protegido por `SuperAdminRoute` (mesmo grupo das demais rotas `/admin/*`).

### Observações

- A página em si (`src/pages/CategorizacaoIA.tsx`) permanece igual — apenas muda o local de acesso.
- O escopo continua respeitando o contexto atual (PF/PJ) para regras `company`/`user`; regras `system` ficam visíveis ao super admin como já eram.
- Nenhuma mudança de banco/RLS necessária.