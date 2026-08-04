import { describe, expect, it } from "vitest";
import {
  extractCounterparty,
  formatDocument,
  isInternalBankCharge,
  matchBankByConnector,
  counterpartyLabel,
} from "../counterparty";

const OWN = "58.241.366/0001-32";

function pix(payer: unknown, receiver: unknown) {
  return { paymentData: { payer, receiver, paymentMethod: "PIX" } };
}

const side = (name: string | null, doc: string | null, type = "CNPJ") => ({
  name,
  documentNumber: doc ? { type, value: doc } : null,
});

describe("extractCounterparty", () => {
  it("usa o pagador em entradas", () => {
    const cp = extractCounterparty(
      {
        amount: 250,
        description: "PIX RECEBIDO",
        raw: pix(side("Rafael De Paula Castro", "023.559.691-40", "CPF"), side(null, OWN)),
      },
      { ownDocuments: [OWN] },
    );
    expect(cp).toEqual({
      name: "Rafael De Paula Castro",
      document: "023.559.691-40",
      documentType: "CPF",
      internal: false,
    });
  });

  it("usa o recebedor em saídas", () => {
    const cp = extractCounterparty(
      {
        amount: -1200,
        description: "TRANSF ENVIADA PIX",
        raw: pix(side(null, OWN), side("PAGAR.ME S.A.", "18.727.053/0001-74")),
      },
      { ownDocuments: [OWN] },
    );
    expect(cp.name).toBe("PAGAR.ME S.A.");
    expect(cp.document).toBe("18.727.053/0001-74");
    expect(cp.documentType).toBe("CNPJ");
    expect(cp.internal).toBe(false);
  });

  it("descarta o documento da própria empresa", () => {
    const cp = extractCounterparty(
      { amount: -50, description: "PIX ENVIADO", raw: pix(side(null, OWN), side(null, OWN)) },
      { ownDocuments: [OWN] },
    );
    expect(cp.document).toBeNull();
    expect(cp.internal).toBe(false);
  });

  it("usa merchant em compras de cartão", () => {
    const cp = extractCounterparty({
      amount: -89.9,
      description: "COMPRA CARTAO",
      raw: { merchant: { businessName: "POSTO SHELL LTDA", cnpj: "12.345.678/0001-95" } },
    });
    expect(cp.name).toBe("POSTO SHELL LTDA");
    expect(cp.document).toBe("12.345.678/0001-95");
  });

  it("marca tarifas como débito interno do banco", () => {
    const cp = extractCounterparty({ amount: -32.9, description: "TARIFA PACOTE DE SERVICOS", raw: {} });
    expect(cp.internal).toBe(true);
    expect(cp.name).toBeNull();
  });

  it("marca rendimento como interno", () => {
    const cp = extractCounterparty({ amount: 4.21, description: "Rendimento Poupança", raw: {} });
    expect(cp.internal).toBe(true);
  });

  it("não marca interno quando existe contraparte externa", () => {
    const cp = extractCounterparty({
      amount: -10,
      description: "JUROS PAGOS A FORNECEDOR",
      raw: pix(side(null, OWN), side("FORNECEDOR X LTDA", "11.222.333/0001-44")),
    }, { ownDocuments: [OWN] });
    expect(cp.internal).toBe(false);
    expect(cp.name).toBe("FORNECEDOR X LTDA");
  });

  it("retorna vazio sem dados", () => {
    const cp = extractCounterparty({ amount: -10, description: "DEBITO EM CONTA", raw: null });
    expect(cp.name).toBeNull();
    expect(cp.document).toBeNull();
    expect(cp.internal).toBe(false);
  });
});

describe("helpers", () => {
  it("formata CPF e CNPJ", () => {
    expect(formatDocument("02355969140")).toBe("023.559.691-40");
    expect(formatDocument("18727053000174")).toBe("18.727.053/0001-74");
  });

  it("detecta cobranças internas", () => {
    expect(isInternalBankCharge({ amount: -1, description: "IOF sobre operação" })).toBe(true);
    expect(isInternalBankCharge({ amount: -1, description: "PIX para mercado" })).toBe(false);
  });

  it("casa o conector com o banco cadastrado", () => {
    const banks = [
      { id: "1", name: "Inter", tax_id: null },
      { id: "2", name: "Banco Inter", tax_id: "00.416.968/0001-01" },
      { id: "3", name: "Banco do Brasil", tax_id: "00.000.000/0001-91" },
    ];
    expect(matchBankByConnector("Inter Empresas", banks)?.id).toBe("1");
    expect(matchBankByConnector("Banco Inter PJ", banks)?.id).toBe("2");
    expect(matchBankByConnector("Banco do Brasil Empresas", banks)?.id).toBe("3");
    expect(matchBankByConnector("Banco Fictício", banks)).toBeNull();
  });

  it("monta o rótulo da contraparte", () => {
    expect(
      counterpartyLabel({ name: "ACME", document: "11.222.333/0001-44", documentType: "CNPJ", internal: false }),
    ).toBe("ACME • CNPJ 11.222.333/0001-44");
  });
});
