import { describe, expect, it } from "vitest";
import { compararSalarioCargo, salarioReferencia, sugerirNomeVariacao } from "@/lib/dp/cargos";

describe("salarioReferencia", () => {
  it("retorna null quando o cargo não tem salário", () => {
    expect(salarioReferencia({ id: "1", nome: "ATENDENTE" })).toBeNull();
    expect(salarioReferencia(null)).toBeNull();
  });
  it("retorna o valor numérico", () => {
    expect(salarioReferencia({ id: "1", nome: "X", salario_base: 2200 })).toBe(2200);
  });
});

describe("compararSalarioCargo", () => {
  const cargo = { id: "1", nome: "ATENDENTE", salario_base: 2200 };

  it("sem salário informado", () => {
    expect(compararSalarioCargo(cargo, 0).status).toBe("sem_salario_informado");
    expect(compararSalarioCargo(cargo, null).status).toBe("sem_salario_informado");
  });
  it("cargo sem salário de referência", () => {
    expect(compararSalarioCargo({ id: "1", nome: "A" }, 2200)).toEqual({
      status: "cargo_sem_salario",
      salarioInformado: 2200,
    });
  });
  it("valores iguais (com tolerância de centavos)", () => {
    expect(compararSalarioCargo(cargo, 2200).status).toBe("ok");
    expect(compararSalarioCargo(cargo, 2200.001).status).toBe("ok");
  });
  it("valores divergentes", () => {
    expect(compararSalarioCargo(cargo, 2500)).toEqual({
      status: "divergente",
      salarioCargo: 2200,
      salarioInformado: 2500,
    });
  });
});

describe("sugerirNomeVariacao", () => {
  it("sugere II quando o nome base já existe", () => {
    expect(sugerirNomeVariacao("ATENDENTE", [{ nome: "ATENDENTE" }])).toBe("ATENDENTE II");
  });
  it("avança para III quando II já existe", () => {
    expect(
      sugerirNomeVariacao("ATENDENTE", [{ nome: "ATENDENTE" }, { nome: "Atendente II" }]),
    ).toBe("ATENDENTE III");
  });
  it("usa a raiz do nome quando já vem com sufixo", () => {
    expect(sugerirNomeVariacao("ATENDENTE II", [{ nome: "ATENDENTE" }, { nome: "ATENDENTE II" }])).toBe(
      "ATENDENTE III",
    );
  });
  it("nome vazio devolve string vazia", () => {
    expect(sugerirNomeVariacao("  ", [])).toBe("");
  });
});
