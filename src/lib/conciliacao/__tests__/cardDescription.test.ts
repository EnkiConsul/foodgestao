import { describe, it, expect } from "vitest";
import {
  cardOperationLabel,
  cardLast4FromRaw,
  cleanMerchantSpacing,
  formatProviderDescription,
  hasMerchantName,
  isCardOperationCode,
} from "@/lib/conciliacao/cardDescription";

describe("cardDescription", () => {
  it("identifica código de operação", () => {
    expect(isCardOperationCode("CREDITO_A_VISTA")).toBe(true);
    expect(isCardOperationCode("Pagamento recebido")).toBe(true);
    expect(isCardOperationCode("PONTO DA CARNE GOIANIA BR")).toBe(false);
    expect(isCardOperationCode("")).toBe(false);
  });

  it("traduz códigos conhecidos e humaniza desconhecidos", () => {
    expect(cardOperationLabel("CREDITO_A_VISTA")).toBe("Compra no crédito à vista");
    expect(cardOperationLabel("PAGAMENTO_RECEBIDO")).toBe("Pagamento da fatura");
    expect(cardOperationLabel("ALGO_NOVO_QUALQUER")).toBe("Algo novo qualquer");
  });

  it("extrai final do cartão e descarta placeholder", () => {
    expect(cardLast4FromRaw({ creditCardMetadata: { cardNumber: "0038" } })).toBe("0038");
    expect(cardLast4FromRaw({ creditCardMetadata: { cardNumber: "0000" } })).toBeNull();
    expect(cardLast4FromRaw(null)).toBeNull();
  });

  it("monta rótulo com categoria e final do cartão", () => {
    expect(
      formatProviderDescription("CREDITO_A_VISTA", {
        category: "Digital services",
        creditCardMetadata: { cardNumber: "0038" },
      }),
    ).toBe("Compra no crédito à vista • Serviços digitais • cartão ••••0038");

    expect(formatProviderDescription("CREDITO_A_VISTA", { creditCardMetadata: { cardNumber: "0000" } })).toBe(
      "Compra no crédito à vista",
    );
  });

  it("preserva estabelecimento e limpa espaçamento", () => {
    expect(hasMerchantName("PONTO DA CARNE           GOIANIA      BR")).toBe(true);
    expect(formatProviderDescription("PONTO DA CARNE           GOIANIA      BR", {})).toBe(
      "PONTO DA CARNE • GOIANIA",
    );
    expect(cleanMerchantSpacing("ModernMarket             GOIANIA      BR")).toBe("ModernMarket • GOIANIA");
    expect(formatProviderDescription("Pix recebido de ACME", {})).toBe("Pix recebido de ACME");
  });

  it("descrição vazia continua vazia", () => {
    expect(formatProviderDescription(null, {})).toBe("");
  });
});
