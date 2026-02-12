

## Adicionar campo de vinculacao (Pessoa Fisica / Empresa) no formulario de Conta Bancaria

### O que sera feito

Adicionar um novo campo **"Vinculado a"** no formulario de criacao e edicao de conta bancaria (`AccountFormDialog`), permitindo ao usuario escolher se a conta pertence a **Pessoa Fisica** ou a uma das **empresas** cadastradas.

### Como funciona hoje

Atualmente, o contexto (PF ou PJ) e definido automaticamente pelo `useCompanyContext` global -- o usuario precisa trocar o perfil no seletor do header antes de criar a conta. Nao ha campo visivel no formulario para escolher a vinculacao.

### Alteracoes planejadas

**1. `src/components/accounts/AccountFormDialog.tsx`**

- Adicionar estados `ownerType` (`"pf"` | `"pj"`) e `ownerCompanyId` (`string | null`)
- Buscar a lista de empresas do usuario via `useCompanyContext` (ja disponivel no hook)
- Renderizar um novo campo **Select** com label "Vinculado a" contendo:
  - Opcao "Pessoa Fisica (Pessoal)"
  - Uma opcao para cada empresa ativa do usuario
- No `useEffect` de inicializacao:
  - **Criacao:** pre-selecionar com base no contexto global atual
  - **Edicao:** carregar o valor salvo da conta (`account.context` e `account.company_id`)
- No `handleSubmit`:
  - Usar `ownerType` para o campo `context`
  - Usar `ownerCompanyId` para o campo `company_id`
  - Na edicao, incluir `context` e `company_id` no `update`

**2. `src/pages/ContasBancarias.tsx`** (opcional, melhoria visual)

- Exibir o nome da empresa vinculada ou "Pessoal" na listagem de contas, para que o usuario visualize a vinculacao.

### Detalhes tecnicos

- O campo usara o componente `Select` do Radix UI ja presente no projeto
- As empresas serao obtidas de `useCompanyContext().companies` (ja carregadas)
- A RLS existente ja suporta insercao/edicao com `company_id` para admins/owners e contas pessoais para o proprio usuario
- Na edicao, o `update` passara a incluir `context` e `company_id` para permitir a transferencia de vinculacao
- O campo sera obrigatorio: sempre tera "Pessoa Fisica" como opcao padrao

