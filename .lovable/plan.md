## Causa

No `TransactionFormDialog.tsx` (linha ~622-638), ao gerar as parcelas futuras de uma recorrência, o código faz `{ ...payload, ... }` — ou seja, copia **todo** o payload do lançamento original, incluindo `status: "confirmado"`, `payment_date` e `bill_status: "pago"`.

Resultado: se você criou o lançamento atual como "Pago" (status confirmado), todas as ocorrências futuras nascem também como pagas, com a mesma `payment_date` da original — o que está errado, porque elas ainda nem aconteceram.

## Correção proposta

Ajustar a geração de `futurePayloads` para que as ocorrências futuras sempre nasçam como **pendentes / a vencer**, independentemente do status do lançamento-pai:

- `status` → `"pendente"`
- `payment_date` → `null`
- `bill_status` → `"em_dia"` se houver `due_date`, senão `null`
- `paid_amount` / `amount_paid` (se aplicável) → `null` / `0`

A ocorrência original (o "pai") mantém o status que o usuário escolheu. Apenas as futuras passam a nascer como pendentes.

## Arquivos afetados

- `src/components/transactions/TransactionFormDialog.tsx` — bloco de geração de `futurePayloads` (linhas ~619-639).

## Fora de escopo

- Não alterar lançamentos recorrentes já criados no banco (correção é apenas para novos cadastros).
- Não mudar comportamento de edição de transações existentes.