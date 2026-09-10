import { describe, expect, it } from "vitest";
import { deveReconciliarPisoCargo } from "@/lib/dp/cargos";

describe("deveReconciliarPisoCargo", () => {
  it("empregado com unidade entra na regra do piso", () => {
    expect(deveReconciliarPisoCargo({ socio: false, unidadeId: "uni-1" })).toBe(true);
  });

  it("sócio com unidade entra, pela referência da empresa", () => {
    expect(deveReconciliarPisoCargo({ socio: true, unidadeId: "uni-1" })).toBe(true);
  });

  it("sem unidade específica não há patronal para o piso", () => {
    expect(deveReconciliarPisoCargo({ socio: false, unidadeId: null })).toBe(false);
    expect(deveReconciliarPisoCargo({ socio: false })).toBe(false);
  });
});
