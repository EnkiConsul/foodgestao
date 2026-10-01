import { describe, expect, it } from "vitest";
import { elegivelDocumento } from "../pendencias-documentos";
import { valorSugeridoCents, whatsappUrl } from "../recibos";

const base = { id: "x", ativo: true, data_admissao: "2026-01-01", optante_adiantamento: true };

describe("freelancer mensalista nas pendências", () => {
  it("cobra recibo mensal e adiantamento do mensalista", () => {
    const c = { ...base, regime: "freelancer", forma_pagamento: "mensalista" };
    expect(elegivelDocumento("contracheque", c, { competencia: "2026-08" })).toBe(true);
    expect(elegivelDocumento("adiantamento", c, { competencia: "2026-08" })).toBe(true);
    expect(elegivelDocumento("ponto", c, { competencia: "2026-08", unidadeTemRelogio: true })).toBe(false);
  });
  it("não cobra do freelancer diarista", () => {
    const c = { ...base, regime: "freelancer", forma_pagamento: "diarista" };
    expect(elegivelDocumento("contracheque", c, { competencia: "2026-08" })).toBe(false);
    expect(elegivelDocumento("adiantamento", c, { competencia: "2026-08" })).toBe(false);
  });
});

describe("recibos", () => {
  it("sugere salário base + assiduidade no acerto mensal", () => {
    expect(valorSugeridoCents({ salario_base: "1750.00", premio_assiduidade: true, premio_assiduidade_valor: 100 }, "acerto_mensal")).toBe(185000);
    expect(valorSugeridoCents({ salario_base: "1750.00" }, "teste_operacional")).toBeNull();
  });
  it("monta o link do WhatsApp com DDI", () => {
    expect(whatsappUrl("(62) 99236-5959", "CRISTIANE MARTINS", "https://x/recibo/abc")).toContain("https://wa.me/5562992365959?text=");
  });
});
