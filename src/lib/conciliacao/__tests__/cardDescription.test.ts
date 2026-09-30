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

  it("mantém o texto do banco quando há estabelecimento", () => {
    expect(formatProviderDescription("PONTO DA CARNE           GOIANIA      BR", {})).toBe(
      "PONTO DA CARNE GOIANIA BR",
    );
    expect(hasMerchantName("PONTO DA CARNE           GOIANIA      BR")).toBe(true);
    expect(formatProviderDescription("Pix recebido de ACME", {})).toBe("Pix recebido de ACME");
    // A descrição editada pelo usuário tem prioridade sobre o texto bruto do banco.
    expect(
      formatProviderDescription("Descrição reescrita", {
        descriptionRaw: "PONTO DA CARNE           GOIANIA      BR",
      }),
    ).toBe("Descrição reescrita");
    // Sem descrição editada, cai no texto bruto do banco.
    expect(
      formatProviderDescription(null, {
        descriptionRaw: "PONTO DA CARNE           GOIANIA      BR",
      }),
    ).toBe("PONTO DA CARNE GOIANIA BR");
  });

  it("traduz o código genérico usando o detalhe da operação", () => {
    expect(
      formatProviderDescription("CREDITO_A_VISTA", {
        operationType: "OUTROS",
        operationTypeAdditionalInfo: "ENCARG FINANC FATURADOS",
      }),
    ).toBe("Encargos financeiros faturados");

    expect(
      formatProviderDescription("CREDITO_A_VISTA", {
        operationType: "OUTROS",
        operationTypeAdditionalInfo: "IOF Rotativo",
      }),
    ).toBe("IOF rotativo");

    expect(
      formatProviderDescription("CREDITO_A_VISTA", {
        operationType: "OUTROS",
        operationTypeAdditionalInfo: "Despesa com Cobranca",
      }),
    ).toBe("Despesa com cobrança");

    expect(
      formatProviderDescription("CREDITO_A_VISTA", {
        operationType: "PAGAMENTO",
        operationTypeAdditionalInfo: "NA",
      }),
    ).toBe("Pagamento da fatura");

    // Sem detalhe: cai na tradução do próprio código.
    expect(
      formatProviderDescription("CREDITO_A_VISTA", {
        operationType: "OPERACOES_CREDITO_CONTRATADAS_CARTAO",
        operationTypeAdditionalInfo: "NA",
        category: "Digital services",
        creditCardMetadata: { cardNumber: "0038" },
      }),
    ).toBe("Compra no crédito à vista");
  });

  it("rótulo auxiliar traz ramo e final do cartão sem repetir a descrição", () => {
    expect(
      cardHintLabel("CREDITO_A_VISTA", {
        category: "Digital services",
        creditCardMetadata: { cardNumber: "0038" },
      }),
    ).toBe("Serviços digitais • cartão ••••0038");

    // Compra: o rótulo padronizado traz a cidade do estabelecimento.
    expect(cardHintLabel("PONTO DA CARNE GOIANIA BR", {})).toBe("GOIANIA");
    expect(cardHintLabel("Juros de atraso", {})).toBe("Encargo do cartão");
    expect(cardHintLabel("Ipremium Store 2/3", {})).toBe("Parcela 2/3");

  });

  it("descrição vazia continua vazia", () => {
    expect(formatProviderDescription(null, {})).toBe("");
  });
});

