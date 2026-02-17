
## Adicionar Campo "Cliente/Fornecedor" ao Formulário de Lançamento

### O que sera feito
Adicionar um campo Select opcional de "Cliente/Fornecedor" no formulário de criação/edição de lançamentos, permitindo vincular um contato a cada transação.

### Alterações

**1. `src/components/transactions/TransactionFormDialog.tsx`**
- Adicionar estado `contactId` para armazenar o contato selecionado
- Carregar a lista de contatos ativos do usuário no `loadData` (junto com `contact_companies` para filtrar por empresa no contexto PJ)
- Filtrar contatos conforme o contexto: no modo PF mostra contatos com `visible_pf = true`, no modo PJ filtra pela empresa selecionada via tabela `contact_companies`
- Adicionar o campo Select "Cliente/Fornecedor (opcional)" no formulário, posicionado entre Categoria e Forma de Pagamento
- O campo sera exibido apenas para receitas e despesas (nao para transferencias)
- Incluir `contact_id` no payload de insert/update
- Popular o campo ao editar um lancamento existente
- Limpar o campo no `resetForm`

**2. `src/components/transactions/TransactionFormDialog.tsx` - Interface `EditableTransaction`**
- Adicionar `contact_id?: string | null` para suportar edicao

### Detalhes tecnicos
- A tabela `transactions` ja possui a coluna `contact_id` (uuid, nullable)
- A tabela `contacts` ja existe com campos `name`, `contact_type`, `visible_pf`, `is_active`
- A tabela `contact_companies` ja existe para vinculos PJ
- Nenhuma migracao de banco necessaria
