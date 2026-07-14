## Objetivo

Estabilizar a ordem/hierarquia das categorias em PF e PJ, eliminando o loop de reescrita de `hierarchy_index` e a ordenação lexicográfica errada.

## Causa raiz

Em `src/pages/Categorias.tsx`:

- Query ordena por `hierarchy_index` (texto) → `"1.10."` < `"1.2."` lexicograficamente.
- `useEffect` grava `hierarchy_index` a cada mudança de `categories` → dispara realtime → refetch → novo cálculo → novo update. Loop.
- `buildTree` calcula `index` baseado na ordem do array, que já vem instável.

## Mudanças

**1. Query (linhas 190-219)** — ordenar por campos estáveis:
- Trocar `.order("hierarchy_index", { nullsFirst: false })` por ordenação por `parent_id NULLS FIRST, sort_order, name`.
- `hierarchy_index` deixa de ser critério de ordenação — vira apenas rótulo visual calculado em memória.

**2. Persistência automática (linhas 296-310)** — remover o `useEffect` que grava `hierarchy_index` no banco a cada render. O índice visual (`1.`, `1.1.`, `1.2.`) passa a ser 100% derivado em memória pelo `buildTree` — sem gravação, sem loop.

**3. `sort_order` como fonte da verdade** — já é usado pelo `handleReorder` (linhas 386-410) ao mover itens com setas ↑↓. Continua funcionando normalmente; agora sem competição com `hierarchy_index`.

**4. Coluna `hierarchy_index` no banco** — mantida por compatibilidade, mas não é mais gravada pelo frontend. Como o usuário do plano 360°FOOD já tem esse valor semeado, ele ainda aparece no tooltip de "Índice anterior"/badges se algum componente lê. Não precisa migração.

## Impactos

- **PF:** ordem para de dançar entre reloads/edições.
- **PJ:** categorias do plano 360°FOOD continuam com os mesmos índices visuais (calculados na hora com base em `sort_order`).
- **Realtime:** continua sincronizando criação/edição/exclusão, mas sem loop de update-por-render.
- **Sem alteração de schema.** Sem migração.

## Arquivo alterado

- `src/pages/Categorias.tsx` (query + remoção do useEffect de persistência)
