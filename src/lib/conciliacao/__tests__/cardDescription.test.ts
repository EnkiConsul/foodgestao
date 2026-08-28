import { describe, it, expect } from "vitest";
import {
  cardHintLabel,
  cardOperationLabel,
  cardLast4FromRaw,
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

  it("mantém o texto do banco sem reescrever", () => {
    expect(
      formatProviderDescription("CREDITO_A_VISTA", {
        category: "Digital services",
        creditCardMetadata: { cardNumber: "0038" },
      }),
    ).toBe("CREDITO_A_VISTA");

    expect(formatProviderDescription("PONTO DA CARNE           GOIANIA      BR", {})).toBe(
      "PONTO DA CARNE GOIANIA BR",
    );
    expect(hasMerchantName("PONTO DA CARNE           GOIANIA      BR")).toBe(true);
    expect(formatProviderDescription("Pix recebido de ACME", {})).toBe("Pix recebido de ACME");
    expect(
      formatProviderDescription("Descrição reescrita", {
        descriptionRaw: "PONTO DA CARNE           GOIANIA      BR",
      }),
    ).toBe("PONTO DA CARNE GOIANIA BR");
  });

  it("rótulo auxiliar traz operação, ramo e final do cartão", () => {
    expect(
      cardHintLabel("CREDITO_A_VISTA", {
        category: "Digital services",
        creditCardMetadata: { cardNumber: "0038" },
      }),
    ).toBe("Compra no crédito à vista • Serviços digitais • cartão ••••0038");

    // Compra: o rótulo padronizado traz a cidade do estabelecimento.
    expect(cardHintLabel("PONTO DA CARNE GOIANIA BR", {})).toBe("GOIANIA");
    expect(cardHintLabel("Juros de atraso", {})).toBe("Encargo do cartão");
    expect(cardHintLabel("Pagamento recebido", {})).toBe("Pagamento da fatura");
    expect(cardHintLabel("Ipremium Store 2/3", {})).toBe("Parcela 2/3");

  });

  it("descrição vazia continua vazia", () => {
    expect(formatProviderDescription(null, {})).toBe("");
  });
});

