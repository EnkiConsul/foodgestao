import { describe, expect, it } from "vitest";
import { resolveRowDirection, isRowEntrada } from "@/lib/conciliacao/cardRouting";

describe("resolveRowDirection", () => {
  it("conta bancária: positivo é entrada, negativo é saída", () => {
    expect(resolveRowDirection({ amount: 100, type: "CREDIT", isCardAccount: false })).toBe("entrada");
    expect(resolveRowDirection({ amount: -100, type: "DEBIT", isCardAccount: false })).toBe("saida");
    expect(resolveRowDirection({ amount: 0, type: null, isCardAccount: false })).toBe("entrada");
  });

  it("cartão: compra (positivo/DEBIT) é saída", () => {
    expect(resolveRowDirection({ amount: 26.9, type: "DEBIT", isCardAccount: true })).toBe("saida");
    expect(resolveRowDirection({ amount: 26.9, type: null, isCardAccount: true })).toBe("saida");
  });

  it("cartão: pagamento da fatura e estorno (negativo/CREDIT) é entrada", () => {
    expect(resolveRowDirection({ amount: -146.68, type: "CREDIT", isCardAccount: true })).toBe("entrada");
    expect(resolveRowDirection({ amount: -146.68, type: null, isCardAccount: true })).toBe("entrada");
  });

  it("cartão: o tipo do provedor prevalece sobre o sinal", () => {
    expect(resolveRowDirection({ amount: -10, type: "DEBIT", isCardAccount: true })).toBe("saida");
    expect(resolveRowDirection({ amount: 10, type: "credit", isCardAccount: true })).toBe("entrada");
  });

  it("isRowEntrada acompanha resolveRowDirection", () => {
    expect(isRowEntrada({ amount: 10, type: "DEBIT", isCardAccount: true })).toBe(false);
    expect(isRowEntrada({ amount: 10, type: "CREDIT", isCardAccount: false })).toBe(true);
  });
});
