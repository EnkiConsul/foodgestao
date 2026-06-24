## Objetivo

Ao clicar em **Editar** em um lançamento que faz parte de uma série recorrente, abrir antes um diálogo perguntando o escopo da alteração:

- **Somente este** — altera apenas o lançamento clicado.
- **Este e os próximos** — altera o clicado e todas as ocorrências futuras (mesma série, `transaction_date >= date do clicado`).
- **Todos** — altera o pai e todos os filhos da série.

Para lançamentos não recorrentes, abrir o formulário direto como hoje (sem perguntar).

## Como ficará para o usuário

1. Usuário clica em Editar num lançamento recorrente.
2. Aparece um diálogo curto com 3 opções (radio) + Cancelar / Continuar.
3. Após escolher, abre o formulário normal de edição.
4. Ao salvar, a alteração é aplicada conforme o escopo escolhido, com toast indicando quantos lançamentos foram atualizados.
5. Registro no log de auditoria inclui o escopo (`edit_scope: single | forward | all`), seguindo o mesmo padrão já usado em exclusão.

Campos que NÃO se propagam mesmo em "forward/all" (porque são específicos de cada ocorrência):

- `transaction_date`, `due_date`, `payment_date`
- `status`, `bill_status`, `amount_paid`
- `is_recurring`, `recurrence_type`, `recurrence_end_date`, `parent_transaction_id`
- Anexos (upload acontece apenas no lançamento clicado)

Os demais campos (descrição, valor, categoria, conta, forma de pagamento, contato, notas, contexto/empresa, conta de destino) propagam.

## Mudanças técnicas

### `src/pages/Lancamentos.tsx`

- Novo estado `editScopePrompt: Transaction | null` e `editScope: "single" | "forward" | "all"`.
- Trocar o handler do botão Editar:
  - se `tx.is_recurring || tx.parent_transaction_id` → `setEditScopePrompt(tx)`;
  - senão → fluxo atual (`setEditTransaction(tx); setDialogOpen(true)`).
- Novo `<AlertDialog>` (mesma estética do delete-scope existente nas linhas 1385+) com `RadioGroup` das 3 opções. Ao confirmar:
  - guardar o escopo num ref/estado (`pendingEditScope`);
  - abrir `TransactionFormDialog` com o `transaction` clicado.
- Aplicar o mesmo prompt nas ações de Editar do bulk bar quando `bulkHasRecurring`, ou (para simplificar este escopo) manter o bulk como está e tratar só o Editar individual — confirmar com o usuário se quer também o bulk.

### `src/components/transactions/TransactionFormDialog.tsx`

- Aceitar nova prop opcional `editScope?: "single" | "forward" | "all"` (default `"single"`).
- No branch `isEditing` (linha ~596), em vez de só `update().eq("id", transaction.id)`:
  - construir `propagatePayload` removendo os campos não-propagáveis listados acima;
  - `single`: comportamento atual (update no id, payload completo).
  - `forward`:
    - `seriesParentId = transaction.parent_transaction_id ?? transaction.id`;
    - update no lançamento clicado com payload completo;
    - update em `transactions` onde `parent_transaction_id = seriesParentId AND transaction_date > transaction.transaction_date` com `propagatePayload`;
    - se o clicado for o pai, isso já cobre os filhos; se for um filho, o pai não é alterado (comportamento esperado de "este e os próximos").
  - `all`:
    - update no pai (`seriesParentId`) com payload completo (+ campos de recorrência) ;
    - update em todos os filhos (`parent_transaction_id = seriesParentId`) com `propagatePayload`.
- Toast com contagem: `Lançamento atualizado (N afetados)`.
- Audit log inclui `edit_scope`.

### Sem mudanças de schema

A estrutura `parent_transaction_id` já existe; nenhuma migração necessária.

## Diagrama do fluxo

```text
Editar clicado
   │
   ├─ recorrente? ── não ──► abre formulário (fluxo atual)
   │
   └─ sim ──► AlertDialog escopo
                  ├─ Somente este     ─┐
                  ├─ Este e os próximos ─┼─► abre formulário com editScope
                  └─ Todos            ─┘        │
                                                ▼
                                          Salvar aplica escopo
```

## Pergunta antes de implementar

Devo aplicar o mesmo prompt de escopo ao botão **Editar** da barra de ações em lote (quando algum selecionado é recorrente), ou manter o bulk inalterado nesta etapa?
