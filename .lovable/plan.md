

## Vincular Formas de Pagamento a Empresas / Pessoa Fisica

### O que sera feito

Adicionar um campo de selecao multipla no formulario de criacao/edicao de formas de pagamento, permitindo vincular cada forma a **Pessoa Fisica** e/ou a uma ou mais **empresas** cadastradas. A vinculacao tambem sera exibida na listagem.

### Alteracoes no banco de dados

Seguindo o mesmo padrao ja usado em `contact_companies` e `category_companies`:

- Adicionar coluna `visible_pf` (boolean, default true) na tabela `payment_methods`
- Criar tabela de juncao `payment_method_companies` com:
  - `id` (uuid, PK)
  - `payment_method_id` (uuid, FK para payment_methods)
  - `company_id` (uuid, FK para companies)
  - `created_at` (timestamp)
  - Indice unico em (payment_method_id, company_id)
  - RLS: usuarios podem gerenciar vinculos das suas proprias formas de pagamento (via subquery em `payment_methods.user_id`)

### Alteracoes no codigo

**1. `src/components/payment-methods/PaymentMethodFormDialog.tsx`**

- Importar `useCompanyContext` e `Checkbox`
- Adicionar estados `visiblePf` (boolean) e `selectedCompanyIds` (string[])
- Renderizar checkboxes para "Pessoa Fisica (Pessoal)" e cada empresa ativa
- Na edicao, carregar `visible_pf` do item e buscar IDs existentes de `payment_method_companies`
- No submit: salvar `visible_pf` no registro e sincronizar a tabela de juncao (delete antigos + insert novos)
- Validar que pelo menos uma opcao esteja marcada

**2. `src/pages/FormasPagamento.tsx`**

- Buscar vinculos de `payment_method_companies` com nome da empresa
- Exibir badges ("Pessoal" e/ou nomes de empresas) abaixo do nome da forma de pagamento
- Passar `visible_pf` no `editItem` para o dialog

### Detalhes tecnicos

- Padrao identico ao implementado em Contatos (`contact_companies` + `visible_pf`)
- RLS usa subquery: `EXISTS (SELECT 1 FROM payment_methods pm WHERE pm.id = payment_method_companies.payment_method_id AND pm.user_id = auth.uid())`
- Checkboxes do Radix UI (`@radix-ui/react-checkbox`) ja disponivel no projeto
- Empresas obtidas via `useCompanyContext().companies`
