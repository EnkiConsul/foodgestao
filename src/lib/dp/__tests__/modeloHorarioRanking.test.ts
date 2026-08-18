import { describe, expect, it } from "vitest";
import { sugerirModeloHorario, type ModeloHorarioRanking } from "@/lib/dp/modeloHorarioRanking";

const modelo = (cargo: string, entrada: string, usadoEm: string): ModeloHorarioRanking => ({
  cargo_id: cargo,
  horario: { entrada, saida: "18:00", intervalo_minutos: 60 },
  folga_variavel: false,
  usado_em: usadoEm,
  dias: [{ dow: 1, trabalha: true, turno_id: null }],
});

describe("sugerirModeloHorario", () => {
  it("prioriza a rotina mais frequente do cargo", () => {
    const modelos = [
      modelo("cozinha", "08:00", "2026-01-01"),
      modelo("cozinha", "08:00", "2026-02-01"),
      modelo("salao", "10:00", "2026-03-01"),
      modelo("salao", "10:00", "2026-04-01"),
      modelo("salao", "10:00", "2026-05-01"),
    ];
    expect(sugerirModeloHorario(modelos, "cozinha")?.horario?.entrada).toBe("08:00");
  });

  it("usa a empresa quando o cargo não tem histórico", () => {
    const modelos = [
      modelo("cozinha", "08:00", "2026-01-01"),
      modelo("salao", "08:00", "2026-02-01"),
      modelo("salao", "10:00", "2026-03-01"),
    ];
    expect(sugerirModeloHorario(modelos, "gerencia")?.horario?.entrada).toBe("08:00");
  });

  it("desempata pela utilização mais recente", () => {
    const modelos = [
      modelo("cozinha", "08:00", "2026-01-01"),
      modelo("cozinha", "10:00", "2026-03-01"),
    ];
    expect(sugerirModeloHorario(modelos, "cozinha")?.horario?.entrada).toBe("10:00");
  });
});