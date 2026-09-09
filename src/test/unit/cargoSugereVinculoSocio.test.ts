import { describe, expect, it } from "vitest";
import { cargoSugereVinculoSocio } from "@/lib/dp/cargos";

describe("cargoSugereVinculoSocio", () => {
  it("reconhece cargos de sócio", () => {
    expect(cargoSugereVinculoSocio("Sócio")).toBe(true);
    expect(cargoSugereVinculoSocio("Socio")).toBe(true);
    expect(cargoSugereVinculoSocio("Sócia")).toBe(true);
    expect(cargoSugereVinculoSocio("Sócio Administrador")).toBe(true);
    expect(cargoSugereVinculoSocio("SOCIOS")).toBe(true);
  });

  it("não confunde outros cargos", () => {
    expect(cargoSugereVinculoSocio("Assistente Social")).toBe(false);
    expect(cargoSugereVinculoSocio("Associado")).toBe(false);
    expect(cargoSugereVinculoSocio("Garçom")).toBe(false);
    expect(cargoSugereVinculoSocio("")).toBe(false);
    expect(cargoSugereVinculoSocio(null)).toBe(false);
  });
});
