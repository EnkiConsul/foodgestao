import { describe, it, expect } from "vitest";
import { cienciaDivergenciaValida, divergenciasComFicha } from "@/lib/dp/ficha-registro/divergencia";

describe("divergenciasComFicha", () => {
  it("não alerta quando o sistema segue a ficha", () => {
    expect(divergenciasComFicha({ cargoNome: "Cumim", salario: "1.800,00" }, { cargoNome: "CUMIM", salario: 1800 })).toEqual([]);
  });
  it("alerta cargo e salário diferentes da ficha", () => {
    const d = divergenciasComFicha({ cargoNome: "CUMIM", salario: 1800 }, { cargoNome: "GARÇOM", salario: 2000 });
    expect(d.map((x) => x.campo)).toEqual(["cargo", "salario"]);
  });
  it("ausência na ficha não gera alerta", () => {
    expect(divergenciasComFicha({}, { cargoNome: "GARÇOM", salario: 2000 })).toEqual([]);
  });
  it("exige 15 caracteres e ciência", () => {
    expect(cienciaDivergenciaValida("curto", true)).toBe(false);
    expect(cienciaDivergenciaValida("Promoção homologada pela contabilidade", false)).toBe(false);
    expect(cienciaDivergenciaValida("Promoção homologada pela contabilidade", true)).toBe(true);
  });
});
