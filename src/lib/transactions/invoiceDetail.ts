/** Resumo de conferência do detalhamento de uma fatura de cartão. */
export type InvoiceDetailRow = {
  amount: number;
  transaction_type: "entrada" | "saida" | "transferencia";
};

export type InvoiceDetailSummary = {
  count: number;
  /** Soma assinada: saídas positivas, entradas (estornos/créditos) negativas. */
  net: number;
  previousBalance: number;
  /** net + rotativo anterior — deve bater com o total da fatura. */
  expectedTotal: number;
};

export function summarizeInvoiceDetail(
  rows: InvoiceDetailRow[],
  previousBalance = 0
): InvoiceDetailSummary {
  const net = rows.reduce(
    (acc, r) => acc + (r.transaction_type === "entrada" ? -Number(r.amount) : Number(r.amount)),
    0
  );
  return {
    count: rows.length,
    net,
    previousBalance: Number(previousBalance) || 0,
    expectedTotal: net + (Number(previousBalance) || 0),
  };
}
