# Lançamentos do cartão do Open Finance na fatura correta

Hoje o cartão é vinculado (após a tela de autorização, em `pluggy_accounts.linked_credit_card_id`), mas os lançamentos das contas de cartão entram na conciliação sem destino de cartão: a tela só resolve conta bancária (`linked_account_id`) e confirma via `pluggy_confirm_staging(p_account_id …)`. Resultado: compras do cartão viram lançamento de conta bancária ou ficam sem destino, e não entram na fatura.

## Como vai passar a funcionar

1. Cada linha do extrato passa a saber se veio de uma conta de cartão. Nessas linhas, em vez do seletor de conta bancária, aparece o **cartão vinculado** como destino (bloqueado quando já existe vínculo; com aviso "cartão não autorizado ainda" e atalho para a tela de autorização quando não existe).
2. Ao confirmar, o lançamento é gravado com `credit_card_id` (e `account_id` nulo), o que já dispara o motor existente de faturas e joga o valor na fatura do mês correto pelo dia de fechamento do cartão.
3. Pagamento da fatura: quando um débito na conta bancária for identificado como pagamento de fatura do cartão, ele continua como lançamento da conta bancária, marcado como pagamento de fatura (não duplica despesa).
4. Cartão ainda pendente de autorização: as linhas ficam retidas com aviso claro em vez de serem conciliadas na conta errada. Nada é confirmado às cegas.
5. Transferência/contraparte não é oferecida para linhas de cartão (não faz sentido no extrato de cartão).

## Detalhes técnicos

**Banco**
- Nova RPC `pluggy_confirm_staging_card(p_staging_ids uuid[], p_credit_card_id uuid, p_category_id uuid, p_payment_method_id uuid, p_contact_id uuid)`, espelhando `pluggy_confirm_staging` mas gravando `credit_card_id` e `account_id = NULL`, respeitando o CHECK `(account_id IS NULL) <> (credit_card_id IS NULL)`.
  - Valida que o cartão pertence à empresa/contexto do usuário (mesmo padrão de `link_open_finance_account`).
  - Mantém idempotência por `pluggy_transaction_id` / `external_id` e a marcação de `pluggy_staging_transactions.status = 'confirmed'` + `matched_transaction_id`.
  - `REVOKE` de PUBLIC/anon, `GRANT EXECUTE` para `authenticated`, como as demais RPCs de conciliação.
- Sem novas tabelas; `transactions.credit_card_id` e o trigger de fatura já existem.

**Frontend (`src/pages/ConciliacaoPluggy.tsx`)**
- Ao carregar o mapa de `pluggy_accounts`, incluir `type` (ou `raw.type`) e `linked_credit_card_id`; montar `cardByPluggyAccount` e `isCardAccount`.
- Linhas de cartão: coluna de destino mostra o cartão (badge) em vez do `Select` de contas; agrupar a confirmação por cartão e chamar a nova RPC; excluir essas linhas do fluxo de transferência.
- Linhas de cartão sem `linked_credit_card_id`: desabilitar seleção, exibir alerta com link para a tela de autorização (`PluggyCreditCardReviewDialog`).

**Sync (`supabase/functions/pluggy-sync-item/index.ts`)**
- Nenhuma mudança de comportamento necessária no staging; apenas garantir que o `type` da conta espelhada esteja disponível para a conciliação (já gravado em `pluggy_accounts`).

**Testes**
- Unitário do agrupamento/roteamento de linhas (cartão vs banco vs transferência) em `src/test/unit/`.
- Teste de RLS/permissão da nova RPC (cartão de outra empresa deve falhar) em `src/test/rls/`.

## Verificação
- Conciliar uma compra de cartão e conferir que aparece na fatura do mês correto em Cartões de Crédito, sem alterar saldo de conta bancária.
- Reconfirmar a mesma linha não duplica lançamento.
