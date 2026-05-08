## Funcionalidade: Resetar Dados (Painel Admin)

Adicionar uma seção "Zona de Perigo" no Painel Admin (`/admin`) que permite ao super admin apagar dados de forma seletiva, escolhendo exatamente o que limpar e de quem.

### Localização
- Nova aba "Resetar Dados" em `src/pages/Admin.tsx`, ao lado das abas existentes (Stats, Usuários, Auditoria).
- Restrita via `SuperAdminRoute` (já existe).

### Interface (novo componente `src/components/admin/AdminResetData.tsx`)

1. **Seleção de alvo** (radio):
   - Um usuário específico (combobox listando usuários da tabela `profiles`)
   - Uma empresa específica (combobox listando `companies`)
   - Todos os meus dados (do super admin logado)

2. **Seleção de escopo** (checkboxes — usuário marca o que apagar):
   - Lançamentos (`transactions` + `transaction_tags` + `transaction_attachments`)
   - Contas bancárias (`accounts`)
   - Categorias (`categories` + `category_companies`)
   - Contatos (`contacts` + `contact_companies`)
   - Formas de pagamento (`payment_methods` + `payment_method_companies`)
   - Orçamentos (`budgets`)
   - Centros de custo (`cost_centers`)
   - Tags (`tags`)
   - Empresas (`companies` + `company_members` + `company_invites`) — apenas quando alvo = usuário
   - Logs de auditoria do alvo (`audit_logs`)
   - Atalho "Marcar tudo"

3. **Filtro de contexto** (radio, aplicável aos itens com `context`):
   - Apenas PF (`context = 'pf'`)
   - Apenas PJ/empresa (`context = 'pj'`)
   - Ambos

4. **Confirmação dupla**:
   - Modal de aviso explicando que a ação é irreversível
   - Campo onde o usuário deve digitar `APAGAR` para liberar o botão final
   - Resumo do que será apagado (alvo + escopo + contexto)

5. **Feedback**:
   - Toast com contagem de registros apagados por tabela
   - Registro automático em `audit_logs` (ação `reset_data`) com detalhes (alvo, escopo, contexto, contagens)

### Backend (Edge Function)

Criar edge function `supabase/functions/admin-reset-data/index.ts`:
- Valida JWT e checa `is_super_admin(user.id)` via service role
- Recebe payload: `{ target: { type, userId?, companyId? }, scope: string[], context: 'pf'|'pj'|'both' }`
- Valida com Zod
- Usa `SUPABASE_SERVICE_ROLE_KEY` para executar deletes (bypassa RLS com segurança)
- Ordem de delete respeitando dependências (filhos antes dos pais):
  1. `transaction_tags`, `transaction_attachments` → `transactions`
  2. `category_companies` → `categories`
  3. `contact_companies` → `contacts`
  4. `payment_method_companies` → `payment_methods`
  5. `budgets`, `cost_centers`, `tags`
  6. `accounts`
  7. `company_invites`, `company_members` → `companies`
- Filtra por `user_id` ou `company_id` conforme alvo, e por `context` quando aplicável
- Retorna contagem de registros removidos por tabela
- Chama `insert_audit_log` ao final

### Detalhes técnicos

- **Não apaga**: `profiles`, `user_roles`, `auth.users` (preserva login e perfil)
- **Storage**: ao apagar `transaction_attachments`, também remover arquivos do bucket `transaction-attachments` (loop pelos `file_url`)
- **Anexos de empresa**: ao apagar empresa, deletar transações vinculadas primeiro
- **Realtime/UI**: invalidar todas as queries do React Query após sucesso (`queryClient.invalidateQueries()`)
- **Segurança**: edge function usa `verify_jwt = false` por padrão Lovable, mas valida JWT manualmente e exige `super_admin`

### Arquivos a criar/editar
- Criar `supabase/functions/admin-reset-data/index.ts`
- Criar `src/components/admin/AdminResetData.tsx`
- Editar `src/pages/Admin.tsx` (adicionar aba "Resetar Dados")
