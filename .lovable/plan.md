## Objetivo
Remover a numeração posicional (1., 4.2., …) exibida na frente do nome das categorias — ela é apenas um rótulo visual e não representa nenhum código real.

## O que muda

1. **Linha da categoria** (`src/components/categorias/CategoryRow.tsx`)
   - Remover o `<span>` que exibe `{cat.index}.` antes do nome.
   - A hierarquia continua evidente pela indentação, pelo chevron de expandir/colapsar e pelo destaque em maiúsculas das categorias raiz.

2. **Ajuste de espaçamento**
   - Compensar a largura liberada (`w-10 md:w-20`) para o nome não ficar colado na bolinha de cor, mantendo o alinhamento em desktop e mobile.

## Detalhes técnicos
- O campo `index` continua sendo calculado em `src/lib/categories/tree.ts` (`buildCategoryTree`), pois é usado como chave/ordenação interna — só deixa de ser renderizado.
- Nenhuma alteração de banco, RPC ou RLS.

## Fora de escopo
- A ordenação e o drag-and-drop de categorias continuam funcionando como hoje.
- O badge de conta contábil (código do plano de contas) permanece visível.
