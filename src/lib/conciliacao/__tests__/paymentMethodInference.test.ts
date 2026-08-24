import { describe, it, expect } from "vitest";
import {
  inferPaymentMethodKey,
  matchPaymentMethodId,
  suggestPaymentMethodId,
} from "../paymentMethodInference";

const PMS = [
  { id: "boleto", name: "Boleto" },
  { id: "pix", name: "Pix" },
  { id: "credito", name: "Cartão de Crédito" },
  { id: "dinheiro", name: "Dinheiro" },
  { id: "debito", name: "Cartão de Débito" },
  { id: "ted", name: "Transferência / TED" },
  { id: "ifood", name: "iFood" },
  { id: "cheque", name: "Cheque" },
];

const raw = (paymentMethod: string | null) => ({
  paymentData: paymentMethod ? { paymentMethod } : null,
});

describe("inferPaymentMethodKey", () => {
  it("usa o meio informado pelo banco (PIX)", () => {
    expect(inferPaymentMethodKey({ description: "PIX ENVIADO SANEAGO", raw: raw("PIX") })).toBe("pix");
  });

  it("identifica boleto", () => {
    expect(
      inferPaymentMethodKey({ description: "PAGAMENTO DE BOLETO OUTROS BANCOS", raw: raw("BOLETO") }),
    ).toBe("boleto");
  });

  it("identifica cartão de crédito mesmo com meio OTHER", () => {
    expect(
      inferPaymentMethodKey({
        description: "PAGAMENTO CARTAO CREDITO BCE 20/07 CARTAO MASTER",
        raw: raw("OTHER"),
      }),
    ).toBe("credito");
  });

  it("identifica cartão de débito pela descrição", () => {
    expect(inferPaymentMethodKey({ description: "COMPRA CARTAO DEBITO POSTO", raw: raw("OTHER") })).toBe("debito");
  });

  it("identifica TED/transferência", () => {
    expect(inferPaymentMethodKey({ description: "TED RECEBIDA CLIENTE", raw: raw("OTHER") })).toBe("ted");
  });

  it("cai no texto quando o banco não informa: tarifa de PIX", () => {
    expect(inferPaymentMethodKey({ description: "TARIFA AVULSA ENVIO PIX 08/07/2026", raw: raw("OTHER") })).toBe("pix");
  });

  it("não sugere nada para aplicação financeira", () => {
    expect(inferPaymentMethodKey({ description: "APLICACAO CONTAMAX", raw: raw("OTHER") })).toBeNull();
  });

  it("não sugere nada sem descrição nem raw", () => {
    expect(inferPaymentMethodKey({})).toBeNull();
  });
});

describe("matchPaymentMethodId", () => {
  it("casa nomes com acento e variações", () => {
    expect(matchPaymentMethodId("ted", PMS)).toBe("ted");
    expect(matchPaymentMethodId("credito", PMS)).toBe("credito");
    expect(matchPaymentMethodId("pix", PMS)).toBe("pix");
  });

  it("retorna null quando a empresa não tem a forma cadastrada", () => {
    expect(matchPaymentMethodId("cheque", [{ id: "p", name: "Pix" }])).toBeNull();
  });

  it("retorna null para chave nula", () => {
    expect(matchPaymentMethodId(null, PMS)).toBeNull();
  });
});

describe("suggestPaymentMethodId", () => {
  it("infere e resolve em uma chamada", () => {
    expect(
      suggestPaymentMethodId({ description: "PIX RECEBIDO NAGASUBIAS", raw: raw("PIX") }, PMS),
    ).toBe("pix");
  });
});

describe("compra no débito com paymentMethod OTHER", () => {
  const raw = {
    type: "DEBIT",
    paymentData: { paymentMethod: "OTHER", payer: { documentNumber: { type: "CPF", value: "023.559.691-40" } }, receiver: null },
  };

  it("reconhece pelo texto 'Compra no débito'", () => {
    expect(inferPaymentMethodKey({ description: "Compra no débito|POSTO MADRI", raw })).toBe("debito");
  });

  it("infere débito quando não há texto nem recebedor externo", () => {
    expect(inferPaymentMethodKey({ description: "Supermercado - Carnes", category_pluggy: "Groceries", raw })).toBe("debito");
  });

  it("não confunde transferência Pix com compra", () => {
    expect(
      inferPaymentMethodKey({
        description: "Transferência enviada|ACME",
        raw: { type: "DEBIT", paymentData: { paymentMethod: "PIX", payer: {}, receiver: { name: "ACME" } } },
      }),
    ).toBe("pix");
  });
});
