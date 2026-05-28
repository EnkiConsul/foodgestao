## Objetivo

Quando o usuário usa o seletor múltiplo para excluir lançamentos, se algum dos selecionados pertencer a uma série recorrente, oferecer as mesmas opções da exclusão individual: **somente os selecionados**, **selecionados + ocorrências futuras** ou **série inteira (passadas, atuais e futuras)**.

## Mudanças em `src/pages/Lancamentos.tsx`

1. **Estado novo**: `bulkDeleteScope: "single" | "forward" | "all"` (default `"single"`).

2. **Detecção de série**: derivar `bulkHasRecurring` a partir dos IDs selecionados — verdadeiro se qualquer transação selecionada tem `is_recurring === true` ou `parent_transaction_id !== null`.

3. **`AlertDialog` de exclusão em massa**:
   - Continua simples quando `bulkHasRecurring === false`.
   - Quando `bulkHasRecurring === true`, mostrar `RadioGroup` com 3 opções (mesma copy do diálogo individual):
     - "Excluir apenas os selecionados"
     - "Excluir os selecionados e as ocorrências futuras"
     - "Excluir todas as ocorrências da série (passadas e futuras)"
   - Resetar `bulkDeleteScope` ao fechar.

4. **`confirmBulkDelete`** passa a respeitar o escopo:
   - **`single`**: comportamento atual — `delete().in("id", ids)`.
   - **`forward`**: para cada selecionado que pertence a série (`seriesParentId = parent_transaction_id ?? id`), excluir filhos com `transaction_date >= tx.transaction_date` e o próprio `tx.id`. Selecionados que não são recorrentes são excluídos pelo `id`. Deduplicar por `seriesParentId` para não disparar a mesma query duas vezes.
   - **`all`**: para cada série representada nos selecionados, calcular `seriesParentIds = unique(parent_transaction_id ?? id)`; excluir todos os filhos (`parent_transaction_id IN seriesParentIds`) e os próprios pais (`id IN seriesParentIds`). Selecionados não recorrentes seguem por `id`.

5. **Audit log**: incluir `delete_scope` em `transactions_bulk_deleted` `_details` (mantém `count` e `ids`).

6. **Toast**: mensagem adaptada — `"X lançamento(s) excluído(s)"`, `"X selecionado(s) + ocorrências futuras excluídos"`, `"Séries excluídas (X selecionado(s))"`.

## Fora do escopo

- Edição em massa (`BulkEditDialog`) não muda.
- Exclusão individual já existente permanece igual.
- Nenhuma alteração de schema/RLS.

## Resultado esperado

Ao clicar em "Excluir selecionados" com pelo menos um item de série recorrente entre os marcados, aparecem as 3 opções (somente / + futuras / série inteira). Quando nenhum item é recorrente, o diálogo continua simples como hoje.