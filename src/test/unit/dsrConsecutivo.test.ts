import { describe, it, expect } from "vitest";
import {
  avaliarRiscoDsrTroca,
  maiorSequenciaTrabalhada,
} from "@/lib/dp/dsr-consecutivo";

describe("maiorSequenciaTrabalhada", () => {
  it("devolve 0 quando o dia é de descanso", () => {
    expect(
      maiorSequenciaTrabalhada({ dataIso: "2026-10-01", descansoIso: new Set(["2026-10-01"]) }),
    ).toBe(0);
  });

  it("conta os dias trabalhados entre dois descansos", () => {
    const descanso = new Set(["2026-10-04", "2026-10-11"]);
    // 05 a 10 = 6 dias trabalhados
    expect(maiorSequenciaTrabalhada({ dataIso: "2026-10-07", descansoIso: descanso })).toBe(6);
  });
});

describe("avaliarRiscoDsrTroca", () => {
  it("sinaliza risco quando a folga cedida cria 7 dias seguidos", () => {
    // Descanso semanal nas quintas: 01, 08 e 15 de outubro de 2026
    const descanso = new Set(["2026-10-01", "2026-10-08", "2026-10-15"]);
    const r = avaliarRiscoDsrTroca({
      descansoIso: descanso,
      diaCedidoIso: "2026-10-08",
      diaNovoIso: "2026-10-16",
    });
    expect(r.sequencia).toBeGreaterThanOrEqual(7);
    expect(r.risco).toBe(true);
  });

  it("não sinaliza risco quando ainda sobra descanso na semana", () => {
    // Quem descansa sábado e domingo: cede o domingo 25/10 e folga na quarta 21/10
    const descanso = new Set([
      "2026-10-10",
      "2026-10-11",
      "2026-10-17",
      "2026-10-18",
      "2026-10-24",
      "2026-10-25",
      "2026-10-31",
    ]);
    const r = avaliarRiscoDsrTroca({
      descansoIso: descanso,
      diaCedidoIso: "2026-10-25",
      diaNovoIso: "2026-10-21",
    });
    expect(r.risco).toBe(false);
  });
});
