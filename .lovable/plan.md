# Corrigir filtro de mês em Lançamentos

## Diagnóstico (confirmado por leitura do código)

Em `src/pages/Lancamentos.tsx` (linha 273) a query traz qualquer transação cujo `transaction_date` **OU** `due_date` caia no mês selecionado:

```
.or(and(transaction_date IN mês), and(due_date IN mês))
```

Como não há filtro adicional no cliente para lançamentos com vencimento, uma conta lançada (transaction_date) neste mês mas com `due_date` em outro mês aparece na tela. É exatamente o comportamento reportado.

O critério correto para a lista mensal de "Lançamentos / Contas a Pagar/Receber" é:

- Se o registro tem `due_date` (é uma conta) → considerar apenas o `due_date` para decidir em que mês aparece.
- Se não tem `due_date` (movimentação simples) → usar `transaction_date`.

Assim, contas "vencem no mês visível" e movimentações comuns continuam por data do lançamento.

## Alterações

Arquivo: `src/pages/Lancamentos.tsx`

1. **Query (fetchTransactions, ~linha 273)** — trocar o `.or(...)` por:
   ```
   .or(`and(due_date.is.null,transaction_date.gte.${monthStart},transaction_date.lte.${monthEnd}),and(due_date.gte.${monthStart},due_date.lte.${monthEnd})`)
   ```
   Ou seja: sem `due_date` filtra por `transaction_date`; com `due_date` filtra por `due_date`.

2. **Filtro cliente (bloco de filtros do `displayRows`, ~linha 548-616)** — adicionar guarda defensiva equivalente para o caso de dados vindos do cache/realtime:
   ```ts
   const ref = t.due_date ?? t.transaction_date;
   if (ref < monthStart || ref > monthEnd) return;
   ```

Nenhum outro comportamento (status, saldo anterior via RPC, ordenação, etc.) é afetado — o RPC `get_balance_before` já usa `monthStart` como corte.

## Validação

- Abrir mês atual: uma conta com `transaction_date` = hoje e `due_date` no mês seguinte NÃO deve mais aparecer.
- Navegar para o mês do `due_date` dela: passa a aparecer.
- Movimentações sem `due_date` continuam listadas pelo mês do `transaction_date`.
