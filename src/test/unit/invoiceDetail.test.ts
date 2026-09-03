import { describe, it, expect } from "vitest";
import { summarizeInvoiceDetail } from "@/lib/transactions/invoiceDetail";

describe("summarizeInvoiceDetail", () => {
  it("soma compras e desconta estornos", () => {
    const s = summarizeInvoiceDetail([
      { amount: 19.99, transaction_type: "saida" },
      { amount: 100, transaction_type: "saida" },
      { amount: 20, transaction_type: "entrada" },
    ]);
    expect(s.count).toBe(3);
    expect(s.net).toBeCloseTo(99.99, 2);
    expect(s.expectedTotal).toBeCloseTo(99.99, 2);
  });

  it("inclui rotativo anterior no total esperado", () => {
    const s = summarizeInvoiceDetail([{ amount: 50, transaction_type: "saida" }], 30);
    expect(s.previousBalance).toBe(30);
    expect(s.expectedTotal).toBe(80);
  });

  it("fatura vazia", () => {
    const s = summarizeInvoiceDetail([]);
    expect(s).toEqual({ count: 0, net: 0, previousBalance: 0, expectedTotal: 0 });
  });
});
