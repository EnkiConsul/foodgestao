import { describe, it, expect } from "vitest";
import {
  resolveLancamentoOrigin,
  sumDespesas,
  sumReceitas,
} from "@/lib/transactions/lancamentoOrigin";

describe("lancamentoOrigin", () => {
  it("classifica a origem pela presença do cartão", () => {
    expect(resolveLancamentoOrigin({ credit_card_id: "c1", account_id: null })).toBe("cartao");
    expect(resolveLancamentoOrigin({ credit_card_id: null, account_id: "a1" })).toBe("conta");
    expect(resolveLancamentoOrigin({})).toBe("conta");
  });

  it("não dobra a despesa entre a compra do cartão e o pagamento da fatura", () => {
    const rows = [
      { transactionType: "saida" as const, amount: 19.99, isInvoicePayment: false }, // compra no cartão
      { transactionType: "saida" as const, amount: 19.99, isInvoicePayment: true }, // pagamento da fatura
      { transactionType: "saida" as const, amount: 100, isInvoicePayment: false }, // despesa de conta
    ];
    expect(sumDespesas(rows)).toBeCloseTo(119.99, 2);
  });

  it("soma receitas ignorando movimentos de fatura", () => {
    const rows = [
      { transactionType: "entrada" as const, amount: 50, isInvoicePayment: false },
      { transactionType: "entrada" as const, amount: 30, isInvoicePayment: true },
      { transactionType: "transferencia" as const, amount: 10, isInvoicePayment: false },
    ];
    expect(sumReceitas(rows)).toBe(50);
  });
});
