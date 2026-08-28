# Cartão de crédito: compras aparecendo como "Entrada"

## O que está acontecendo

No Open Finance, contas de **cartão de crédito** usam a convenção contrária à das contas bancárias:

- compra no cartão → valor **positivo** com tipo `DEBIT` (é uma **saída/despesa**)
- pagamento da fatura / estorno → valor **negativo** com tipo `CREDIT` (é uma **entrada** para o cartão)

Confirmado nos dados do cartão BMG (CARTAO BARCELONA):

```text
2026-08-18  CREDITO_A_VISTA       4,61   DEBIT    -> compra (saída)
2026-08-11  CREDITO_A_VISTA      26,90   DEBIT    -> compra (saída)
2026-07-30  Pagamento recebido  -146,68  CREDIT   -> pagamento da fatura
```

Hoje o sistema decide entrada/saída **apenas pelo sinal do valor**, sem olhar se a conta de origem é cartão:

- Tela de conciliação: a linha é tratada como entrada quando `amount >= 0`.
- Função de promoção no banco: tipo `CREDIT` ou valor positivo vira `entrada`.

Resultado: compras do cartão (positivas, `DEBIT`) aparecem como "Entrada" e sugerem categorias de receita e "Cliente" em vez de despesa/fornecedor. Pagamentos da fatura (negativos, `CREDIT`) ficam invertidos também.

## Correção proposta

1. Criar uma função única de orientação da linha em `src/lib/conciliacao/cardRouting.ts`, por exemplo `resolveRowDirection({ amount, type, isCardAccount })`:
   - conta bancária: mantém o comportamento atual (positivo = entrada).
   - conta de cartão: `DEBIT` ou valor positivo = **saída**; `CREDIT` ou valor negativo = **entrada**.
2. Usar essa função na conciliação (`ConciliacaoPluggy.tsx`) em todos os pontos que hoje usam `amount >= 0`: cor do valor, rótulo Entrada/Saída, categorias sugeridas (receita/despesa), aviso de categoria invertida (estorno), rótulo Cliente/Fornecedor e a sugestão de cadastro de contato em massa.
3. Aplicar a mesma regra no Extrato de Conciliação, para o extrato do cartão exibir compras como saída.
4. Ajustar a promoção para lançamento definitivo (`promote_open_finance_transactions`) para receber/considerar a informação de que a conta de origem é cartão e gravar `transaction_type` correto; o valor continua sendo gravado em módulo (`abs`).
5. Testes unitários da nova função cobrindo: compra no cartão, pagamento de fatura, estorno, e linhas de conta bancária (sem regressão).

## Observações

- Não altera o worker de sincronização nem os dados brutos: a convenção da Pluggy é mantida em `pluggy_staging_transactions`; a interpretação passa a ser correta na leitura/promoção.
- Lançamentos de cartão já confirmados com tipo invertido não serão alterados automaticamente. Se quiser, posso listar quantos existem e propor uma correção pontual depois.
- Há **release freeze ativo**: este ajuste precisa ser aprovado como hotfix ou entrar após a certificação.

## Detalhes técnicos

- Arquivos: `src/lib/conciliacao/cardRouting.ts` (nova função + testes), `src/pages/ConciliacaoPluggy.tsx`, `src/pages/ExtratoConciliacao.tsx`, nova migração para `promote_open_finance_transactions`.
- A detecção de cartão reutiliza `isCardPluggyAccount` já existente (contas Pluggy com `type = 'CREDIT'` / vínculo `linked_credit_card_id`).
