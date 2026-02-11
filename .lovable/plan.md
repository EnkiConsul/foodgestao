
# Seletor Global de Perfil e Empresa

## Objetivo
Criar um componente de contexto global que permita ao usuario selecionar o perfil (Pessoa Fisica ou Empresa) e, quando for empresa, selecionar qual empresa deseja movimentar. Esse seletor sera visivel em todos os modulos e filtrara automaticamente os dados exibidos.

## Como vai funcionar

1. O usuario vera no topo da pagina (ou no header/sidebar) um seletor com duas opcoes:
   - **Pessoal (PF)**: mostra apenas dados pessoais do usuario
   - **Empresa X** (uma opcao para cada empresa cadastrada): mostra dados vinculados aquela empresa

2. Ao trocar o contexto, todos os modulos filtram automaticamente os dados pelo campo `context` (pf/pj) e `company_id`.

3. Ao criar novos registros (lancamentos, contas, categorias, etc.), o contexto e empresa selecionados sao aplicados automaticamente.

## Detalhes tecnicos

### 1. Novo hook de contexto global: `src/hooks/useCompanyContext.tsx`
- Cria um React Context (`CompanyContextProvider`) que armazena:
  - `contextType`: "pf" ou "pj"
  - `selectedCompanyId`: uuid da empresa selecionada (null quando PF)
  - `companies`: lista de empresas do usuario (carregadas do banco)
  - `setContext(type, companyId)`: funcao para trocar o contexto
- Persiste a selecao no `localStorage` para manter entre sessoes
- Busca as empresas do usuario ao montar (tabela `companies` com `user_id`)

### 2. Novo componente seletor: `src/components/layout/ContextSelector.tsx`
- Um `Select` (dropdown) exibido no header (`AppHeader.tsx`)
- Opcoes:
  - "Pessoal" (valor: `pf|null`)
  - Uma opcao por empresa ativa: "Nome da Empresa" (valor: `pj|{company_id}`)
- Icone diferenciado: `User` para PF, `Building2` para PJ
- Compacto no mobile, com nome truncado

### 3. Integracao no layout: `src/components/layout/AppHeader.tsx`
- Incluir o `ContextSelector` ao lado do titulo ou no canto direito do header
- Visivel em todas as paginas

### 4. Wrapping no App: `src/App.tsx`
- Envolver a arvore de componentes com `CompanyContextProvider`

### 5. Atualizacao de cada modulo (10 paginas)
Cada pagina sera atualizada para:
- Importar `useCompanyContext()`
- Adicionar filtro nas queries: `.eq("context", contextType)` e, quando PJ, `.eq("company_id", selectedCompanyId)`
- Nos formularios de criacao, preencher automaticamente `context` e `company_id` com os valores do contexto selecionado

**Paginas afetadas:**
- `Dashboard.tsx` - filtrar transactions e accounts pelo contexto
- `Lancamentos.tsx` - filtrar transactions e accounts pelo contexto
- `Contas.tsx` (bills) - filtrar bills pelo contexto
- `ContasBancarias.tsx` - filtrar accounts pelo contexto
- `Categorias.tsx` - filtrar categories pelo contexto
- `Contatos.tsx` - filtrar contacts (sem campo context, mas pode-se filtrar por company se necessario)
- `Orcamento.tsx` - filtrar budgets pelo contexto
- `FluxoCaixa.tsx` - filtrar transactions, bills e accounts pelo contexto
- `Relatorios.tsx` - filtrar transactions pelo contexto
- `Empresas.tsx` - nao precisa de filtro (ja mostra todas as empresas do usuario)

### 6. Atualizacao dos formularios de criacao
Os seguintes dialogs serao atualizados para incluir `context` e `company_id` automaticamente no insert:
- `TransactionFormDialog.tsx`
- `BillFormDialog.tsx`
- `AccountFormDialog.tsx`
- `BudgetFormDialog.tsx`
- `CategoryFormDialog.tsx`
- `ContactFormDialog.tsx`

### Nenhuma mudanca no banco de dados
- Os campos `context` (enum: pf/pj) e `company_id` (uuid nullable) ja existem nas tabelas `accounts`, `bills`, `budgets`, `categories` e `transactions`
- Apenas o frontend sera alterado para utilizar esses campos de forma consistente

### Resumo dos arquivos

| Arquivo | Acao |
|---------|------|
| `src/hooks/useCompanyContext.tsx` | Criar (novo hook/context) |
| `src/components/layout/ContextSelector.tsx` | Criar (novo componente) |
| `src/components/layout/AppHeader.tsx` | Editar (incluir seletor) |
| `src/App.tsx` | Editar (incluir provider) |
| `src/pages/Dashboard.tsx` | Editar (filtro por contexto) |
| `src/pages/Lancamentos.tsx` | Editar (filtro por contexto) |
| `src/pages/Contas.tsx` | Editar (filtro por contexto) |
| `src/pages/ContasBancarias.tsx` | Editar (filtro por contexto) |
| `src/pages/Categorias.tsx` | Editar (filtro por contexto) |
| `src/pages/Contatos.tsx` | Editar (filtro por contexto) |
| `src/pages/Orcamento.tsx` | Editar (filtro por contexto) |
| `src/pages/FluxoCaixa.tsx` | Editar (filtro por contexto) |
| `src/pages/Relatorios.tsx` | Editar (filtro por contexto) |
| `src/components/transactions/TransactionFormDialog.tsx` | Editar (context automatico) |
| `src/components/bills/BillFormDialog.tsx` | Editar (context automatico) |
| `src/components/accounts/AccountFormDialog.tsx` | Editar (context automatico) |
| `src/components/budgets/BudgetFormDialog.tsx` | Editar (context automatico) |
| `src/components/categories/CategoryFormDialog.tsx` | Editar (context automatico) |
| `src/components/contacts/ContactFormDialog.tsx` | Editar (context automatico) |
