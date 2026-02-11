

## Gerar lançamento automaticamente ao pagar uma conta

### Objetivo
Quando o usuario registrar um pagamento (total ou parcial) no modulo Contas, o sistema criara automaticamente um lancamento correspondente na tabela `transactions`, refletindo a movimentacao real no saldo da conta bancaria.

### O que muda para o usuario
- Ao confirmar um pagamento no dialog de pagamento, alem de atualizar o status da conta, um lancamento (receita ou despesa) sera criado automaticamente na tela de Lancamentos.
- O lancamento tera a mesma descricao, categoria, conta bancaria e data do pagamento.
- Isso elimina o trabalho manual de registrar a movimentacao em dois lugares.

---

### Detalhes tecnicos

**Arquivo alterado:** `src/components/bills/PaymentDialog.tsx`

**Mudancas necessarias:**

1. **Receber dados adicionais da bill** -- Expandir a interface `Props` para incluir `bill_type`, `account_id`, `category_id` e `contact_id`, que sao necessarios para criar o lancamento.

2. **Receber o `user_id`** -- Importar `useAuth` para obter o ID do usuario autenticado (necessario para o insert na tabela `transactions`).

3. **Inserir lancamento apos pagamento bem-sucedido** -- Dentro do `handleSubmit`, apos o update da bill ser confirmado (sem erro), executar um `supabase.from("transactions").insert(...)` com:
   - `user_id`: do hook useAuth
   - `description`: prefixo "Pgto: " + descricao da conta
   - `amount`: valor do pagamento (numAmount)
   - `transaction_type`: mesmo `bill_type` da conta (receita/despesa)
   - `transaction_date`: data do pagamento selecionada
   - `account_id`: da bill
   - `category_id`: da bill
   - `contact_id`: da bill
   - `status`: "confirmado"

4. **Tratamento de erro** -- Se o insert do lancamento falhar, exibir um toast de aviso (sem reverter o pagamento ja registrado).

**Arquivo alterado:** `src/pages/Contas.tsx`

5. **Passar campos extras para o PaymentDialog** -- Ajustar o objeto `bill` passado ao `PaymentDialog` para incluir `bill_type`, `account_id`, `category_id` e `contact_id`. Isso requer ajustar o select do Supabase para trazer `account_id` e `contact_id` (que ja estao no schema mas nao sao selecionados explicitamente).

### Fluxo resumido

```text
Usuario clica "Registrar Pagamento"
        |
        v
PaymentDialog abre com dados da bill
        |
        v
Usuario informa valor e data -> clica Confirmar
        |
        v
1. UPDATE bills (amount_paid, status, payment_date)
        |
        v
2. INSERT transactions (lancamento automatico)
        |
        v
Toast de sucesso -> Dialog fecha -> Lista atualiza
```

