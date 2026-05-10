## Objetivo

Adicionar o campo **Data de Pagamento** no formulário de lançamento, permitindo registro manual da data em que o pagamento/recebimento foi efetivado.

## Banco de dados

A coluna `payment_date` (date, nullable) **já existe** na tabela `transactions` — não é necessária migração para criar tabela ou coluna. Hoje ela é preenchida automaticamente como cópia de `transaction_date` quando o status é "confirmado". Vamos passar a respeitar o valor informado pelo usuário.

Se ainda assim quiser uma migração para garantir o estado, posso adicionar uma "no-op" defensiva, mas não é necessário.

## Mudanças no formulário (`TransactionFormDialog.tsx`)

1. **Novo estado** `paymentDate` (string, formato `YYYY-MM-DD`).
2. **Novo input** "Data de pagamento" com ícone de calendário, exibido logo após o campo "Data de vencimento", apenas para `receita`/`despesa` (oculto em transferências).
3. **Pré-preenchimento inteligente**:
   - Ao abrir em modo criação com status "confirmado": default = data do lançamento.
   - Ao editar: usa `transaction.payment_date` existente.
   - Ao alternar status para "pendente"/"cancelado": limpa o campo.
4. **Persistência** (handleSubmit):
   - Status `confirmado` → `payment_date = paymentDate || date`.
   - Status `pendente` ou `cancelado` → `payment_date = null`.
5. **Recorrências futuras**: aplica o mesmo offset usado em `due_date` para gerar `payment_date` quando aplicável (status confirmado).
6. **Edição existente**: carrega `payment_date` no `useEffect` que popula o form.

## Pagamentos parciais

`PaymentDialog.tsx` já grava `payment_date` corretamente — sem alteração.

## Resumo técnico

- 1 arquivo editado: `src/components/transactions/TransactionFormDialog.tsx`.
- Sem migração de banco (coluna já existe).
- Sem mudança de regras de RLS.
