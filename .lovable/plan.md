# Organização de Categorias no Modelo Índice

## Objetivo
Exibir e ordenar Categorias exclusivamente pelo índice hierárquico (`1.`, `1.1`, `1.1.1`, `1.1.1.1`…), sem limite de profundidade, e ao criar uma nova categoria alocá-la automaticamente na próxima posição do índice de acordo com seu pai.

## Situação atual
- A árvore já é construída e um índice (`1`, `1.1`, `1.1.1`) já é exibido antes do nome.
- Porém a ordenação inicial mistura `transaction_type` como agrupador raiz, então a lista é quebrada em blocos Despesa/Receita em vez de seguir estritamente `1 → 1.1 → 1.2 → 2 → 2.1`.
- Ao criar uma nova categoria, o `sort_order` não é atribuído — todas ficam com `0` e a ordem final depende do `name`, quebrando o índice.
- O campo `hierarchy_index` já existe na tabela e é sincronizado após render, mas não é usado na query de ordenação.

## Mudanças

### 1. `src/pages/Categorias.tsx` — ordenação e apresentação
- Substituir `.order("transaction_type").order("sort_order").order("name")` por `.order("hierarchy_index", { nullsFirst: false }).order("sort_order").order("name")`.
- Em `buildTree`, agrupar raízes e filhos apenas por `parent_id` (sem separar por `transaction_type` na raiz). O filtro Todas/Despesas/Receitas continua controlando o que aparece via `filtered`.
- Reordenar siblings em `onDragEnd` sem restringir por `transaction_type` (mantém regra "mesmo pai").
- Ajuste visual leve: usar fonte monoespaçada e largura fixa para o índice, no mesmo estilo de Contas Contábeis (`font-mono text-xs w-20 shrink-0`).

### 2. `src/components/categories/CategoryFormDialog.tsx` — alocação automática no índice
Ao criar (não editar) uma categoria:
- Buscar `MAX(sort_order)` entre os siblings (`user_id = X AND parent_id IS NOT DISTINCT FROM :parentId AND transaction_type = :type`).
- Inserir com `sort_order = max + 1`. Isso garante que a nova categoria vai para o final do índice do pai (ex.: se pai `1.` tem filhos `1.1`, `1.2`, a nova vira `1.3`).
- Ao mudar o pai de uma categoria existente pelo edit, também recalcular `sort_order` para o final do novo pai.

### 3. `hierarchy_index` — manter sincronismo
- A rotina `persistHierarchyIndex` já grava o índice; ela continua sendo chamada após render. Como agora a query já ordena por `hierarchy_index`, o valor persistido é a fonte de verdade e a próxima carga fica ordenada corretamente sem depender do cliente reconstruir a árvore.
- Após criar/editar/reordenar/mover, invalidar a query e deixar `persistHierarchyIndex` regravar os índices.

## Impacto em outros módulos
- Nenhum. `sort_order` e `hierarchy_index` já existem; nenhuma outra tela lê `hierarchy_index` para lógica de negócio (só ordenação visual). Categorias continuam identificadas por `id` em transações, orçamentos, DRE etc.
- Sem migração de banco necessária.

## O que NÃO faremos
- Não alterar Contas Contábeis, DRE, Lançamentos ou Orçamentos.
- Não impor limite de profundidade (já é ilimitado).
- Não renumerar códigos manualmente — o índice é derivado da posição na árvore.
