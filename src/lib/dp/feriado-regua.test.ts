import { describe, it, expect } from "vitest";
import { etapaFeriado } from "./feriado-regua";

describe("régua do feriado", () => {
  it("10 dias antes pede revisão", () => expect(etapaFeriado("2026-11-05", "2026-11-15")).toBe("revisao"));
  it("5 dias antes é o último aviso", () => expect(etapaFeriado("2026-11-10", "2026-11-15")).toBe("ultimo_aviso"));
  it("4 dias antes é convocação definitiva", () => expect(etapaFeriado("2026-11-11", "2026-11-15")).toBe("convocacao_definitiva"));
  it("11 dias antes ainda não alerta", () => expect(etapaFeriado("2026-11-04", "2026-11-15")).toBeNull());
});
