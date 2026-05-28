## Objetivo

Quando o usuário clicar em excluir um lançamento que faz parte de uma série recorrente, oferecer 3 opções (estilo Google Calendar) em vez do checkbox atual:

1. **Somente este lançamento** — exclui apenas o registro clicado
2. **Este e os futuros** — exclui o clicado + todos com `transaction_date >= deste.transaction_date` da mesma série
3. **Todos os lançamentos da série** — exclui o pai + todos os filhos

## Identificação da série

Um lançamento pertence a uma série se:
- É pai recorrente (`is_recurring = true`), ou
- É filho (`parent_transaction_id IS NOT NULL`)

O `parentId` da série é `tx.parent_transaction_id ?? tx.id`.

Para lançamentos avulsos (sem recorrência), manter o diálogo simples atual ("Excluir lançamento?" sem opções).

## Mudanças

### `src/pages/Lancamentos.tsx`

1. Substituir o state `deleteWithChildren: boolean` por `deleteScope: "single" | "forward" | "all"` (default `"single"`).
2. Calcular `isPartOfRecurringSeries` = `tx.is_recurring || !!tx.parent_transaction_id`.
3. Refazer `confirmDelete`:
   - Obter `seriesParentId = tx.parent_transaction_id ?? tx.id`.
   - **single**: delete por `id`.
   - **forward**: delete onde `(id = seriesParentId AND seriesParentId = tx.id) OR parent_transaction_id = seriesParentId`, filtrado por `transaction_date >= tx.transaction_date`. Implementação prática: duas queries — uma para o pai (se aplicável) e uma `.delete().eq("parent_transaction_id", seriesParentId).gte("transaction_date", tx.transaction_date)`, mais delete do próprio `tx.id` se for filho.
   - **all**: delete pai (`id = seriesParentId`) e todos os filhos (`parent_transaction_id = seriesParentId`).
4. Atualizar o `AlertDialog` para mostrar 3 RadioGroup options quando `isPartOfRecurringSeries`, ou manter o diálogo simples para avulsos.
5. Mensagens de toast adaptadas a cada escopo.
6. Atualizar `audit_log` details com `delete_scope`.

## Fora de escopo

- Não alterar a lógica de criação de recorrências.
- Não tocar em outros pontos de exclusão (transferências em lote, super admin reset).
- Não remover o filtro de "não excluir confirmados" — agora todas as opções excluem qualquer status, pois o usuário escolheu explicitamente o escopo.