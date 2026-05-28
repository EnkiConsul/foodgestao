## Problema

Em `src/components/transactions/TransactionFormDialog.tsx`, a lista de categorias do seletor não considera o tipo do lançamento atual (`type`: receita | despesa | transferência). Por isso o usuário vê categorias de despesa ao registrar uma receita (e vice-versa), parecendo que "não está buscando" as categorias certas.

## Mudança

1. No `filteredCategories`, adicionar filtro por `transaction_type`:
   - Se `type === "receita"` → mostrar apenas categorias com `transaction_type === "receita"`.
   - Se `type === "despesa"` → mostrar apenas categorias com `transaction_type === "despesa"`.
   - Se `type === "transferencia"` → categorias ficam ocultas (já é o comportamento atual do bloco no JSX).
   - Manter as regras existentes de visibilidade PF (`visible_pf`) e PJ (`category_companies` por empresa).

2. Limpar `categoryId` quando o usuário trocar o tipo do lançamento, para não manter selecionada uma categoria que deixou de pertencer à nova lista (evita salvar um vínculo inconsistente).

3. Atualizar o índice hierárquico (1., 1.1.) gerado em `flatCategoryOptions` para refletir somente as categorias visíveis após o filtro — já é o que acontece, mas confirmar que o `buildCategoryTree` recebe a lista filtrada.

## Fora do escopo

- Nenhuma alteração de schema, RLS, ou na página `/categorias`.
- Não mexer no `CategoryFormDialog` (criar categoria pelo "+" continua igual; sugestão futura: pré-selecionar o tipo, mas não nesta tarefa salvo se você pedir).

## Resultado esperado

Ao alternar entre Receita e Despesa no formulário de lançamento, o seletor mostra apenas as categorias daquele tipo, com o índice e a bolinha colorida como no módulo Categorias.