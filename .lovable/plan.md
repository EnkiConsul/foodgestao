## Bug

Ao criar um lançamento recorrente com status **Pago** (`confirmado`), o `payload` inclui `amount_paid = numAmount`. Esse `payload` é espalhado nas ocorrências futuras (`...payload`) e o override só zera `status`, `payment_date` e `bill_status` — esquece de zerar `amount_paid`. Resultado: filhos ficam com `amount_paid` cheio, aparecendo como pagos em telas que dependem desse campo (ex.: saldos, "valor pago").

## Correção

Em `src/components/transactions/TransactionFormDialog.tsx`, no override dos `futurePayloads` (~linha 710), adicionar `amount_paid: 0` para garantir que toda ocorrência futura nasça realmente pendente, independente do status do lançamento original.

```ts
status: "pendente",
amount_paid: 0,        // ← novo
payment_date: null,
bill_status: futureDueDate ? "em_dia" : null,
```

Nenhuma mudança de schema, UI ou em outros fluxos. Lançamentos já criados anteriormente com o bug não são corrigidos automaticamente — se necessário, posso oferecer um script de limpeza em seguida.
