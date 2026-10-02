import { describe, expect, it } from "vitest";
import { classificarIsonomia, cienciaIsonomiaValida, domingosEquivalentes, rotuloFolgaDiferenciada } from "../folga-isonomia";

describe("folga-isonomia", () => {
  it("sem sindicato é afirmativo e cita a lei", () => {
    const a = classificarIsonomia([{ id: "1", sindicato_id: null }], [{ id: "2", sindicato_id: null }]);
    expect(a.cenario).toBe("sem_sindicato");
    expect(a.afirmativo).toBe(true);
    expect(a.mensagem).toContain("Art. 461 da CLT");
  });
  it("mesmo sindicato é afirmativo", () => {
    expect(classificarIsonomia([{ id: "1", sindicato_id: "s" }], [{ id: "2", sindicato_id: "s" }]).cenario).toBe("mesmo_enquadramento");
  });
  it("sindicato diferente é orientativo e ainda cita a lei", () => {
    const a = classificarIsonomia([{ id: "1", sindicato_id: "a" }], [{ id: "2", sindicato_id: "b" }]);
    expect(a.afirmativo).toBe(false);
    expect(a.mensagem).toContain("Constituição Federal");
  });
  it("ciência e equivalências", () => {
    expect(cienciaIsonomiaValida(true, "curto")).toBe(false);
    expect(cienciaIsonomiaValida(true, "motivo objetivo documentado")).toBe(true);
    expect(domingosEquivalentes("semanas", 2)).toBe(2);
    expect(rotuloFolgaDiferenciada("por_mes", 2, [1, 0])).toBe("Dom e Seg, 2 por mês");
  });
});
