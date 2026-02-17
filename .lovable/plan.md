

## Permitir Categorias de Receita e Despesa em Qualquer Tipo de Lançamento

### O que sera feito
Atualmente, ao criar um lançamento de "Receita", apenas categorias do tipo "receita" aparecem, e ao criar "Despesa", apenas categorias do tipo "despesa". A alteração permitirá que **todas as categorias** (receita e despesa) fiquem disponíveis independentemente do tipo de lançamento selecionado.

### Alteração

**Arquivo: `src/components/transactions/TransactionFormDialog.tsx`**

- Remover o filtro `if (c.transaction_type !== type) return false;` da função `filteredCategories` (linha 169)
- Manter os demais filtros de contexto (PF/PJ) inalterados
- As categorias continuarão organizadas hierarquicamente, agora exibindo tanto receitas quanto despesas agrupadas

### Detalhes técnicos
- Apenas a linha 169 do filtro de categorias será removida
- Nenhuma outra alteração necessária — a estrutura hierárquica, o payload e a lógica de salvamento permanecem iguais
