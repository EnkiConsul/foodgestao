import { describe, it, expect } from "vitest";
import { trocaExigeAprovacaoGestor } from "@/lib/dp/folga-remarcacao";

describe("trocaExigeAprovacaoGestor", () => {
  it("exige gestor ao trocar sábado por quinta", () => {
    expect(trocaExigeAprovacaoGestor("2026-10-31", "2026-10-29")).toBe(true);
  });
  it("exige gestor ao trocar quinta por domingo", () => {
    expect(trocaExigeAprovacaoGestor("2026-10-29", "2026-10-25")).toBe(true);
  });
  it("não exige em domingo por sábado", () => {
    expect(trocaExigeAprovacaoGestor("2026-10-25", "2026-10-31")).toBe(false);
  });
  it("não exige entre dias de semana", () => {
    expect(trocaExigeAprovacaoGestor("2026-10-27", "2026-10-29")).toBe(false);
  });
});
