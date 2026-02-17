
## Exibir Categorias no Formulario de Lancamento com Estrutura Hierarquica

### O que sera feito
O campo "Categoria" no formulario de novo/editar lancamento passara a exibir as categorias na mesma estrutura hierarquica da pagina de Categorias, com categorias-pai como grupos e subcategorias indentadas.

### Como ficara
- Categorias-pai (sem `parent_id`) aparecerao como cabecalhos de grupo (`SelectLabel`) ou com destaque visual (negrito, sem indentacao)
- Subcategorias aparecerao indentadas com `padding-left` proporcional ao nivel de profundidade
- A ordenacao seguira `sort_order` e `name`, igual a pagina de Categorias

### Alteracoes tecnicas

**1. `src/components/transactions/TransactionFormDialog.tsx`**

- Importar `SelectGroup` e `SelectLabel` do componente Select
- Criar uma funcao `buildCategoryTree` (similar ao `buildTree` da pagina Categorias) que recebe o array `filteredCategories` e retorna os nodes com `depth` e `parent_id`
- Substituir o mapeamento simples `filteredCategories.map(...)` no Select por uma renderizacao hierarquica:
  - Categorias raiz com `depth === 0` e que tenham filhos serao renderizadas como `SelectGroup` com `SelectLabel` (texto em negrito, nao selecionavel)
  - Categorias raiz sem filhos e subcategorias serao `SelectItem` com `paddingLeft` baseado no `depth` (ex: `pl-4` para depth 1, `pl-8` para depth 2)
  - Categorias-pai tambem poderao ser selecionaveis como `SelectItem` logo abaixo do `SelectLabel` do grupo, caso o usuario queira seleciona-las diretamente
- Nenhuma mudanca em estado, payload ou logica de salvamento - apenas visual

### Exemplo visual do Select
```text
RECEITAS (grupo, nao selecionavel)
  Distribuicao de Lucros (ClicSorte)
Freelance
Salario

IMPOSTOS (grupo, nao selecionavel)
  Marketing
Alimentacao
Educacao
...
```
