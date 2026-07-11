## Objetivo
Vincular cada Categoria a uma Conta Contábil, no cadastro e edição. O agrupamento em relatórios (ex.: DRE futuro) será **manual**, feito pelo próprio vínculo escolhido aqui.

## Alterações

### 1. Banco de dados
- Nova coluna `chart_account_id UUID NULL` em `public.categories`, FK para `public.chart_accounts(id)` com `ON DELETE SET NULL`.
- Índice em `categories(chart_account_id)`.
- Categorias existentes permanecem sem vínculo até serem editadas.

### 2. Formulário de Categoria (`src/components/categories/CategoryFormDialog.tsx`)
- Novo estado `chartAccountId`.
- `useQuery` carregando `chart_accounts` do contexto atual (`context = contextType`) com `is_active = true` e `allow_transactions = true`, ordenadas por `code`.
- Novo campo **Conta Contábil (opcional)**, logo abaixo de "Categoria Pai": Select com "Nenhuma" + itens `código — nome`. Hint quando não houver contas contábeis cadastradas.
- Carregar valor de `editCategory.chart_account_id`; enviar `chart_account_id` no insert/update.

### 3. Listagem (`src/pages/Categorias.tsx`)
- Badge discreto com `short_code`/`code` da conta contábil vinculada ao lado do nome, para conferência rápida.

## Fora de escopo
- Nenhum DRE, agrupamento automático ou mudança em IA/Open Finance nesta etapa.
- Sem alteração em triggers, saldos ou lançamentos.