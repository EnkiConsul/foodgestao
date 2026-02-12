

## Vincular Contatos a Empresas / Pessoa Fisica

### O que sera feito

Adicionar um campo de selecao multipla no formulario de criacao/edicao de contatos, permitindo vincular cada contato a **Pessoa Fisica** e/ou a uma ou mais **empresas** cadastradas. As empresas vinculadas tambem serao exibidas na listagem de contatos.

### Alteracoes no banco de dados

Criar uma tabela de juncao `contact_companies` (similar a `category_companies` ja existente) com:

- `id` (uuid, PK)
- `contact_id` (uuid, FK para contacts)
- `company_id` (uuid, FK para companies)
- `created_at` (timestamp)
- RLS: usuarios podem gerenciar vinculos dos seus proprios contatos
- Indice unico em (contact_id, company_id) para evitar duplicatas

Adicionar tambem uma coluna `visible_pf` (boolean, default true) na tabela `contacts` para indicar se o contato esta vinculado a Pessoa Fisica.

### Alteracoes no codigo

**1. `src/components/contacts/ContactFormDialog.tsx`**

- Importar `useCompanyContext` para obter a lista de empresas
- Adicionar estado `visiblePf` (boolean) e `selectedCompanyIds` (string[])
- Renderizar um campo com checkboxes contendo:
  - "Pessoa Fisica (Pessoal)"
  - Uma opcao para cada empresa ativa
- No `useEffect` de inicializacao:
  - **Criacao:** marcar "Pessoa Fisica" por padrao
  - **Edicao:** carregar `visible_pf` do contato e buscar os IDs da tabela `contact_companies`
- No `handleSubmit`:
  - Salvar `visible_pf` no contato
  - Deletar registros antigos de `contact_companies` para o contato
  - Inserir os novos vinculos selecionados

**2. `src/pages/Contatos.tsx`**

- Buscar os vinculos de `contact_companies` junto com o nome da empresa
- Exibir badges com os nomes das empresas vinculadas (e "Pessoal" se `visible_pf` for true) abaixo do nome do contato

### Detalhes tecnicos

- A tabela `contact_companies` segue o mesmo padrao de `category_companies`
- RLS baseada em subquery verificando ownership do contato via `contacts.user_id = auth.uid()`
- No formulario, checkboxes do Radix UI ja disponiveis no projeto serao usados para selecao multipla
- A query de listagem usara um join para trazer os nomes das empresas vinculadas
- Pelo menos uma opcao (PF ou empresa) devera estar selecionada para salvar

