# Seleção de categorias no formulário de lançamento fora do padrão

## Causa (confirmada nos dados e no código)

No formulário de lançamento, as categorias aparecem como uma lista plana, numerada 1., 2., 3... em ordem alfabética, sem os grupos e sem a hierarquia da tela de Categorias. Isso acontece por dois motivos que se somam:

1. **Os grupos (categorias-pai) estão inativos e o backend os omite.** As categorias do print ("Consorcio", "Escola Valentina", "Pensão Ana Luiza"...) são filhas de grupos ("INVESTIMENTOS", "Valentina Filha", "Ana Luiza - Filha"...) que estão com `is_active = false` (o switch "Bloqueada para lançamentos" da tela de Categorias). A função `get_accessible_categories` só inclui pais na árvore quando `is_active = true`, então os filhos voltam órfãos.
2. **O formulário rebaixa órfãos para raiz.** No `buildCategoryTree` de `src/lib/transactions/formHelpers.ts`, quando o pai não está na lista, a categoria vira raiz (`depth 0`). Resultado: lista plana, sem indentação, numerada como se fossem grupos, e ordenada alfabeticamente (todas têm `sort_order = 0`), sem seguir a ordem da árvore cadastrada.
3. **Bug secundário de profundidade:** o mesmo `buildCategoryTree` calcula `depth` em passada única (`node.depth = parent.depth + 1`); se o pai vier depois do filho na lista (a RPC ordena por nome), o filho fica com profundidade errada.

Na tela de Categorias a estrutura aparece correta porque ela carrega todas as categorias (inclusive inativas, com opacidade reduzida) e ordena por `parent_id` → `sort_order` → `name`.

## O que será feito

### 1. RPC `get_accessible_categories`: incluir pais inativos como estrutura
- Na parte recursiva que sobe a árvore, remover a exigência `parent.is_active = true` — pais inativos passam a vir junto apenas para montar a hierarquia.
- Eles chegam ao formulário marcados e o formulário já os trata como "Grupo" não selecionável (badge "Grupo", `selectable: false`) por terem filhos; garantir também que `is_active = false` torne a opção não selecionável mesmo sem filhos visíveis.
- Filhas inativas continuam excluídas (comportamento atual mantido).

### 2. Corrigir `buildCategoryTree` (formHelpers)
- Calcular `depth` durante a varredura recursiva da árvore (raiz → filhos), eliminando o erro quando o pai aparece depois do filho na ordenação por nome.
- Manter a ordem de entrada dentro de cada nível (a RPC já devolve `transaction_type → sort_order → name`, mesma regra da tela de Categorias), então o seletor passa a refletir índice hierárquico (1, 1.1, 1.2, 2...) e a ordenação cadastradas.

### 3. Fallback para órfãos reais
- Se mesmo após o ajuste uma categoria chegar sem o pai (casos legados), mantê-la no fim da lista, visualmente recuada, em vez de rebaixá-la silenciosamente para raiz numerada.

## Verificação
- Teste unitário novo para `buildCategoryTree` cobrindo: pai depois do filho na lista, profundidade de netos, e órfãos.
- Testes existentes de formulário/categorias verdes (`bunx vitest run`).
- Typecheck (`npx tsgo --noEmit -p tsconfig.app.json`).
- Conferência visual no preview: o seletor de categorias do lançamento mostra os grupos (INVESTIMENTOS, Valentina Filha etc.) com filhos indentados e numeração hierárquica igual à tela de Categorias.
