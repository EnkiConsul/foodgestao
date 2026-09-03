/**
 * Origem do lançamento na tela de Lançamentos.
 *
 * - `conta`: movimento de conta bancária (impacta caixa).
 * - `cartao`: compra no cartão de crédito (competência, sem impacto de caixa;
 *   o caixa sai no pagamento da fatura).
 *
 * Boa prática financeira: a despesa é contada uma única vez. A compra do cartão
 * é a despesa (competência); o pagamento da fatura é apenas o movimento de caixa
 * e por isso não entra no total de despesas.
 */
export type LancamentoOrigin = "conta" | "cartao";

export type OriginInput = {
  credit_card_id?: string | null;
  account_id?: string | null;
};

export function resolveLancamentoOrigin(tx: OriginInput): LancamentoOrigin {
  return tx.credit_card_id ? "cartao" : "conta";
}

export type DespesaRow = {
  transactionType: "entrada" | "saida" | "transferencia";
  amount: number;
  isInvoicePayment: boolean;
};

/** Soma as despesas evitando dupla contagem com o pagamento da fatura. */
export function sumDespesas(rows: DespesaRow[]): number {
  return rows
    .filter((r) => r.transactionType === "saida" && !r.isInvoicePayment)
    .reduce((sum, r) => sum + r.amount, 0);
}

/** Soma das receitas (pagamento de fatura nunca é receita). */
export function sumReceitas(rows: DespesaRow[]): number {
  return rows
    .filter((r) => r.transactionType === "entrada" && !r.isInvoicePayment)
    .reduce((sum, r) => sum + r.amount, 0);
}
