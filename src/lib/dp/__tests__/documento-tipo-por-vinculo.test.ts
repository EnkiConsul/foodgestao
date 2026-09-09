import { describe, expect, it } from "vitest";
import { tipoCanonicoPorVinculo, vinculoEhSocio } from "../documento-tipo-por-vinculo";

describe("vinculoEhSocio", () => {
  it("reconhece com e sem acento", () => {
    expect(vinculoEhSocio("Socio")).toBe(true);
    expect(vinculoEhSocio("Sócio")).toBe(true);
    expect(vinculoEhSocio("CLT")).toBe(false);
    expect(vinculoEhSocio(null)).toBe(false);
  });
});

describe("tipoCanonicoPorVinculo", () => {
  const socio = { vinculo_label: "Socio", socio_remuneracao: "pro_labore" };

  it("contracheque de sócio com pró-labore vira recibo de pró-labore", () => {
    expect(tipoCanonicoPorVinculo("contracheque", socio)).toBe("pro_labore");
    expect(tipoCanonicoPorVinculo("contracheque_13", socio)).toBe("pro_labore");
  });

  it("não mexe em outros tipos do sócio", () => {
    expect(tipoCanonicoPorVinculo("atestado", socio)).toBe("atestado");
    expect(tipoCanonicoPorVinculo("contrato", socio)).toBe("contrato");
  });

  it("sócio só com lucros mantém o tipo lido", () => {
    expect(
      tipoCanonicoPorVinculo("contracheque", {
        vinculo_label: "Socio",
        socio_remuneracao: "somente_lucros",
      }),
    ).toBe("contracheque");
  });

  it("empregado mantém contracheque", () => {
    expect(tipoCanonicoPorVinculo("contracheque", { vinculo_label: "CLT" })).toBe("contracheque");
    expect(tipoCanonicoPorVinculo("contracheque", null)).toBe("contracheque");
  });
});
