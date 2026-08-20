import { describe, expect, it } from "vitest";
import {
  buildCreditCardSuggestion,
  dayFromIsoDate,
  extractLast4,
  normalizeBrand,
} from "@/lib/pluggy/creditCardSuggestion";

describe("creditCardSuggestion", () => {
  it("normaliza bandeiras da Pluggy", () => {
    expect(normalizeBrand("MASTERCARD BLACK")).toBe("Mastercard");
    expect(normalizeBrand("visa")).toBe("Visa");
    expect(normalizeBrand("AMEX")).toBe("American Express");
    expect(normalizeBrand(null)).toBe("Outro");
    expect(normalizeBrand("outra coisa")).toBe("Outro");
  });

  it("extrai os últimos 4 dígitos de máscaras diferentes", () => {
    expect(extractLast4("**** 1234")).toBe("1234");
    expect(extractLast4(null, "5555666677778888")).toBe("8888");
    expect(extractLast4("12", null)).toBeNull();
  });

  it("limita o dia a 1..28 e usa fallback", () => {
    expect(dayFromIsoDate("2026-08-31", 1)).toBe(28);
    expect(dayFromIsoDate("2026-08-05", 1)).toBe(5);
    expect(dayFromIsoDate(null, 10)).toBe(10);
    expect(dayFromIsoDate("texto", 7)).toBe(7);
  });

  it("monta a sugestão a partir do payload da Pluggy", () => {
    const suggestion = buildCreditCardSuggestion({
      id: "row-1",
      pluggy_account_id: "acc-1",
      name: "Cartão Empresarial",
      number_masked: "**** 4321",
      raw: {
        marketingName: "Nubank PJ",
        owner: { name: "PAKERE LTDA" },
        creditData: {
          brand: "Mastercard",
          creditLimit: 15000,
          balanceCloseDate: "2026-09-20",
          balanceDueDate: "2026-09-27",
        },
      },
    });

    expect(suggestion).toEqual({
      name: "Cartão Empresarial",
      brand: "Mastercard",
      issuer: "Nubank PJ",
      holderName: "PAKERE LTDA",
      last4: "4321",
      creditLimit: 15000,
      closingDay: 20,
      dueDay: 27,
    });
  });

  it("usa padrões seguros quando a Pluggy não envia creditData", () => {
    const suggestion = buildCreditCardSuggestion({
      id: "row-2",
      pluggy_account_id: "acc-2",
      name: null,
      number_masked: null,
      raw: {},
    });
    expect(suggestion.name).toBe("Cartão de crédito");
    expect(suggestion.brand).toBe("Outro");
    expect(suggestion.creditLimit).toBe(0);
    expect(suggestion.closingDay).toBe(1);
    expect(suggestion.dueDay).toBe(10);
  });
});
