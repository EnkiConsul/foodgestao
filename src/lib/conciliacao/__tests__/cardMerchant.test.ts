import { describe, it, expect } from "vitest";
import { isCardBillPayment, merchantFromCardDescription } from "@/lib/conciliacao/cardMerchant";

describe("cardMerchant", () => {
  it("separa nome e cidade com país no fim", () => {
    expect(merchantFromCardDescription("PONTO DA CARNE GOIANIA BR")).toEqual({
      name: "PONTO DA CARNE",
      city: "GOIANIA",
    });
    expect(merchantFromCardDescription("CONCEBRA GOIANIA BR").name).toBe("CONCEBRA");
    expect(merchantFromCardDescription("WWW.DAZN.COM Sao Paulo BR").name).toBe("WWW.DAZN.COM");
  });

  it("trata cidade composta e código de país colado", () => {
    expect(merchantFromCardDescription("SORVETERIA MEGA GELATT Valparaiso deBR").name).toBe(
      "SORVETERIA MEGA GELATT",
    );
    expect(merchantFromCardDescription("TRIX ACADEMIA APARECIDA DE BR").name).toBe("TRIX ACADEMIA");
    expect(merchantFromCardDescription("DISTRIBUIDORA 365 VALPARAISO DEBR").name).toBe(
      "DISTRIBUIDORA 365",
    );
  });

  it("mantém nome cortado pelo banco", () => {
    expect(merchantFromCardDescription("JERIVA COMERCIO DE ALI ABADIANIA BR").name).toBe(
      "JERIVA COMERCIO DE ALI",
    );
  });

  it("ignora código de operação e pagamento de fatura", () => {
    expect(merchantFromCardDescription("CREDITO_A_VISTA")).toEqual({ name: null, city: null });
    expect(merchantFromCardDescription("Pagamento Fatura")).toEqual({ name: null, city: null });
    expect(merchantFromCardDescription("Pagamento recebido", "Credit card payment")).toEqual({
      name: null,
      city: null,
    });
    expect(isCardBillPayment("Pagamento Fatura")).toBe(true);
    expect(isCardBillPayment("PONTO DA CARNE GOIANIA BR")).toBe(false);
  });

  it("cidade desconhecida permanece no nome", () => {
    expect(merchantFromCardDescription("Garmin Southampton GB").name).toBe("Garmin");
    expect(merchantFromCardDescription("LOJA XPTO CIDADEZINHA BR").name).toBe("LOJA XPTO CIDADEZINHA");
  });

  it("descrição vazia", () => {
    expect(merchantFromCardDescription(null)).toEqual({ name: null, city: null });
  });
});
