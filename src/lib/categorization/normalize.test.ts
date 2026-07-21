import { describe, it, expect } from "vitest";
import { normalizeDescription } from "./normalize";

describe("normalizeDescription", () => {
  const cases: Array<[string, string]> = [
    ["PIX ENVIADO 12/03 AMBEV S.A. NSU 8837261", "AMBEV SA"],
    ["COMPRA CARTAO **** 4412 ATACADAO GOIANIA", "ATACADAO GOIANIA"],
    ["TED 33.014.556/0001-96 COCA COLA FEMSA", "COCA COLA FEMSA"],
    ["PAGAMENTO BOLETO ENEL DISTRIBUICAO GO", "ENEL DISTRIBUICAO GO"],
    ["DEBITO IFOOD*RESTAURANTE 15/07/2026", "IFOOD RESTAURANTE"],
    ["CRÉDITO STONE PAGAMENTOS S.A. REF: 998877", "STONE PAGAMENTOS SA"],
    ["SAQUE 24H BANCO DO BRASIL", "24H BANCO DO BRASIL"],
    ["TARIFA MENSALIDADE PACOTE", "MENSALIDADE PACOTE"],
  ];

  it.each(cases)("normaliza %s -> %s", (input, expected) => {
    expect(normalizeDescription(input)).toBe(expected);
  });

  it("retorna null para vazio ou nulo", () => {
    expect(normalizeDescription("")).toBeNull();
    expect(normalizeDescription(null)).toBeNull();
    expect(normalizeDescription(undefined)).toBeNull();
    expect(normalizeDescription("   ")).toBeNull();
  });

  it("é idempotente", () => {
    const raw = "PIX ENVIADO 12/03 AMBEV S.A. NSU 8837261";
    const once = normalizeDescription(raw);
    expect(normalizeDescription(once)).toBe(once);
  });
});
