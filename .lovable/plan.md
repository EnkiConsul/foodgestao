## Objetivo
Remover da interface de Categorias a exibição do código interno da categoria (`template_code`), mantendo o campo intacto no banco, pois ele continua servindo para organização/rastreio interno do sistema.

## O que muda

1. **Lista de categorias** (`src/components/categorias/CategoryRow.tsx`)
   - Remover o badge com o `template_code` e seu tooltip "ID Interno … imutável, preserva o histórico dos lançamentos".
   - Manter: bolinha de cor, numeração hierárquica (1., 1.1.), nome, badge de conta contábil e badge de subtipo.

2. **Formulário de categoria** (`src/components/categories/CategoryFormDialog.tsx`)
   - Remover o bloco de exibição do "ID Interno" (`template_code`) mostrado na edição.
   - Manter o seletor de Categoria Pai e o vínculo de conta contábil como estão.

## Detalhes técnicos
- Nenhuma alteração de banco, RPC ou RLS. O campo `template_code` continua sendo gravado e usado internamente (herança de plano padrão, histórico de lançamentos).
- Remoção também dos imports de Tooltip que ficarem sem uso em `CategoryRow.tsx`, para não deixar código morto.

## Fora de escopo
- Códigos de **contas contábeis** (badge com o código do plano de contas) continuam visíveis, pois são informação contábil usada pelo usuário. Caso você também queira escondê-los, é só avisar.
