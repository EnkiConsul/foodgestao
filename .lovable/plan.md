# Fechamento de fatura de cartão em operação atômica no banco

Hoje o fechamento roda dentro da edge function `close-credit-card-invoices`, em várias chamadas separadas ao banco por fatura: recalcula totais, lê o total, marca `fechada`, insere a conta a pagar, grava `payment_transaction_id` e abre a próxima fatura. Se qualquer passo falhar no meio (timeout, erro de rede, reprocesso concorrente), a fatura pode ficar fechada sem conta a pagar, ou com a próxima fatura não aberta — estado inconsistente que ninguém reconcilia depois.

Além disso, há um alerta de release: o freeze de certificação (`.lovable/release-freeze.json`) está ativo. Esta mudança é um refactor de robustez, não um hotfix bloqueante — a implementação deve ser tratada como hotfix aprovado ou aguardar o descongelamento. Confirme antes de eu implementar.

## Como vai passar a funcionar

1. Todo o fechamento de uma fatura passa a acontecer em uma única operação no banco: ou tudo é gravado (fatura fechada + mínimo calculado + conta a pagar criada e vinculada + próxima fatura aberta), ou nada é gravado.
2. Duas execuções simultâneas (cron duplicado, retry) não fecham a mesma fatura duas vezes nem criam contas a pagar duplicadas.
3. A rotina diária continua com o mesmo gatilho externo e o mesmo cabeçalho secreto; o que muda é que ela apenas dispara a operação no banco e devolve o resumo (fechadas, abertas, contas a pagar criadas, erros por fatura).
4. Uma fatura com erro não interrompe as demais: ela é registrada no resumo e as outras seguem normalmente.

## Detalhes técnicos

**Nova função no banco**
- `public.close_credit_card_invoices(_limit int default 500, _today date default current_date)` — `SECURITY DEFINER`, `SET search_path = public`, `REVOKE ALL FROM PUBLIC, anon, authenticated` + `GRANT EXECUTE TO service_role`.
- Seleciona faturas `status = 'aberta' AND closing_date < _today` com `FOR UPDATE SKIP LOCKED` (guarda de concorrência, substitui o `.eq('status','aberta')` do update atual).
- Por fatura, dentro de um bloco `BEGIN ... EXCEPTION WHEN OTHERS` (cada fatura vira uma subtransação, erro isolado e acumulado no retorno):
  - `PERFORM public.recalc_credit_card_invoice_totals(inv.id)` e releitura do `total_amount`;
  - `UPDATE credit_card_invoices SET status='fechada', minimum_amount = round(total_amount * minimum_payment_percent/100, 2), closed_at = now()`;
  - se `total_amount > 0` e `default_payment_account_id` não nulo: `INSERT INTO transactions (... is_invoice_payment=true, credit_card_invoice_id, status='pendente', transaction_type='saida' ...)` e `UPDATE credit_card_invoices SET payment_transaction_id = <novo id>`;
  - abre a próxima fatura com `INSERT ... ON CONFLICT (credit_card_id, reference_month) DO NOTHING`, reusando a lógica de dias (`least(dia, dias_do_mês)`) e do deslocamento de vencimento (`due_day > closing_day ? mesmo mês : mês seguinte`) hoje em TypeScript.
- Retorno: `TABLE(closed int, opened int, payables int, errors jsonb)` para o resumo da edge function.
- Idempotência adicional para a conta a pagar: índice único parcial em `transactions (credit_card_invoice_id) WHERE is_invoice_payment` (verificar se já existe; se houver dados legados duplicados, o plano inclui checagem antes de criar o índice, e sem ele o `INSERT` fica condicionado a `NOT EXISTS`).

**Edge function `close-credit-card-invoices/index.ts`**
- Mantém a autenticação por `x-close-secret` (comparação em tempo constante, como já feito em `expire-trials`).
- Passa a ser um único `supabase.rpc('close_credit_card_invoices', { _limit: 500 })` e devolve o resumo; toda a lógica de datas/ciclo em TypeScript é removida.

**Testes**
- `supabase/tests/close_credit_card_invoices.test.sql`: fatura vencida com lançamentos fecha com mínimo correto, cria a conta a pagar vinculada e abre a próxima; rodar duas vezes não duplica nada; fatura sem conta de pagamento fecha sem conta a pagar; permissão negada para `authenticated`.

## Verificação
- Rodar a função no banco em faturas de teste e conferir fatura fechada + conta a pagar + próxima fatura em uma só operação.
- Simular falha na conta a pagar (conta de pagamento inválida) e confirmar que a fatura correspondente não fica meio-fechada e que as outras faturas do lote seguem fechando.
