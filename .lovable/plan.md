# Compras de cartão em Lançamentos e na fatura

## O que o sistema faz hoje (verificado)

- Ao conciliar uma linha de cartão, o lançamento é gravado com `credit_card_id` preenchido e `account_id` vazio, já vinculado à fatura do ciclo. É o caso da única compra de cartão existente hoje ("Assinatura - Prime Vídeo", R$ 19,99, confirmada, ligada a uma fatura).
- O saldo das contas bancárias **não** é afetado por essa compra: a regra em `src/lib/transactions/balance.ts` ignora compras de cartão e considera apenas o pagamento da fatura (`is_invoice_payment`).
- Quando a fatura fecha, o sistema cria uma conta a pagar única (marcada como pagamento de fatura) vinculada à fatura — sem duplicar em reexecuções.
- A tela **Lançamentos** lista todas as transações sem distinguir origem: a compra do cartão aparece igual a uma despesa de conta bancária (coluna Conta vazia) e é somada em "Despesas" junto com o futuro pagamento da fatura.

## Está correto?

Parcialmente. Do ponto de vista contábil, **está correto** a compra existir como lançamento de despesa (regime de competência: a despesa ocorre na compra) e a fatura ser o agrupador que gera a saída de caixa. O que está incorreto é a **apresentação**: hoje a mesma despesa pode ser contada duas vezes nos totais de Lançamentos (a compra e depois o pagamento da fatura), e nada na linha indica que aquilo é compra de cartão e não saída de conta.

Boa prática:
- Compra no cartão = despesa por competência, sem impacto de caixa.
- Pagamento da fatura = movimento de caixa, sem repetir a despesa por categoria.

## Ajuste proposto (só apresentação em Lançamentos)

1. Identificar visualmente as linhas de compra de cartão: na coluna Conta, mostrar o cartão (ex.: "Cartão NEON •••• 4103") em vez de vazio, com selo curto "Cartão".
2. Não somar em duplicidade nos cartões de resumo: contar a despesa uma única vez — a compra do cartão entra em "Despesas" (competência) e o pagamento da fatura passa a ser tratado como movimento de caixa/transferência para a fatura, não como nova despesa.
3. Novo filtro rápido de origem: "Conta bancária" / "Cartão de crédito", para o usuário conferir a fatura ou o caixa separadamente.
4. Manter tudo o mais como está: vínculo com a fatura, saldo das contas, relatórios e a conta a pagar gerada no fechamento não mudam.

## Detalhes técnicos

- `src/pages/Lancamentos.tsx`: incluir `credit_card_id`, `credit_card_invoice_id`, `is_invoice_payment` no `select` e no tipo em `src/components/lancamentos/types.ts`; derivar `origin: "conta" | "cartao"`; usar o rótulo do cartão (reaproveitar `creditCardLabel` de `src/lib/conciliacao/cardRouting.ts`) na coluna Conta; excluir linhas de pagamento de fatura do total de "Despesas" no `useMemo` de `totals`; filtro de origem junto aos filtros existentes.
- Sem migração de banco, sem mudança em conciliação, fechamento de fatura ou cálculo de saldo.
- Testes: caso unitário garantindo que compra de cartão + pagamento da fatura não dobram o total de despesas.
