import { describe, it, expect } from "vitest";
import { resumirFaturas } from "./faturasResumo";

describe("resumirFaturas", () => {
  it("fatura sem conta de cobrança conta como real", () => {
    const r = resumirFaturas([{ status: "paid", amount_cents: 9990, billing_account_id: null }]);
    expect(r.recebidoCents).toBe(9990);
  });
  it("abate o desconto", () => {
    const r = resumirFaturas([{ status: "open", amount_cents: 10000, discount_cents: 1500, is_test: false }]);
    expect(r.aReceberCents).toBe(8500);
  });
  it("exclui faturas de teste", () => {
    const r = resumirFaturas([
      { status: "paid", amount_cents: 5000, is_test: true },
      { status: "overdue", amount_cents: 3000, is_test: true },
      { status: "canceled", amount_cents: 1000, is_test: true },
      { status: "overdue", amount_cents: 2000, is_test: false },
      { status: "canceled", amount_cents: 1000, is_test: false },
    ]);
    expect(r).toEqual({ recebidoCents: 0, aReceberCents: 0, vencidoCents: 2000, canceladas: 1 });
  });
});
