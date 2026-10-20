import { describe, expect, it } from "vitest";
import { documentoPorVinculo, regimeEhEmprego } from "../vinculo-documento";

describe("regimeEhEmprego", () => {
  it("CLT e intermitente são vínculo de emprego", () => {
    expect(regimeEhEmprego("clt")).toBe(true);
    expect(regimeEhEmprego("intermitente")).toBe(true);
    expect(regimeEhEmprego("CLT")).toBe(true);
  });

  it("demais vínculos não são emprego", () => {
    expect(regimeEhEmprego("pj")).toBe(false);
    expect(regimeEhEmprego("mei")).toBe(false);
    expect(regimeEhEmprego("freelancer")).toBe(false);
    expect(regimeEhEmprego("estagio")).toBe(false);
  });
});

describe("documentoPorVinculo", () => {
  it("CLT e intermitente geram Ficha de Admissão com ASO", () => {
    expect(documentoPorVinculo("clt")).toEqual({ titulo: "Ficha de Admissão", slug: "ficha-admissao", aso: true });
    expect(documentoPorVinculo("intermitente").aso).toBe(true);
    expect(documentoPorVinculo(null).titulo).toBe("Ficha de Admissão");
  });

  it("PJ e MEI geram Cadastro de Prestador PJ, sem ASO", () => {
    expect(documentoPorVinculo("pj").titulo).toBe("Cadastro de Prestador PJ");
    expect(documentoPorVinculo("mei").titulo).toBe("Cadastro de Prestador PJ");
    expect(documentoPorVinculo("pj").aso).toBe(false);
  });

  it("freelancer gera Ficha de Profissional Eventual, sem ASO", () => {
    const doc = documentoPorVinculo("freelancer");
    expect(doc.titulo).toBe("Ficha de Profissional Eventual");
    expect(doc.slug).toBe("ficha-profissional-eventual");
    expect(doc.aso).toBe(false);
  });

  it("estágio e temporário têm documento próprio, sem ASO", () => {
    expect(documentoPorVinculo("estagio").titulo).toBe("Ficha de Estagiário");
    expect(documentoPorVinculo("temporario").titulo).toBe("Ficha de Trabalhador Temporário");
  });

  it("vínculo desconhecido cai no padrão CLT", () => {
    expect(documentoPorVinculo("socio").titulo).toBe("Ficha de Admissão");
  });
});
