import { describe, it, expect } from "vitest";
import { configVigente, jornadasDaConfig } from "@/lib/dp/compensacao/jornadasColaborador";

const turnos = [{ id: "t1", nome: "ALMOÇO", entrada: "10:00", saida: "18:20", intervalo_minutos: 60 }];

describe("Calculadora — jornadas do cadastro", () => {
  it("escolhe a configuração vigente hoje (início mais recente, sem fim ou fim futuro)", () => {
    const cs = [
      { id: "a", vigencia_inicio: "2025-01-01", vigencia_fim: "2026-01-31" },
      { id: "b", vigencia_inicio: "2026-02-01", vigencia_fim: null },
      { id: "c", vigencia_inicio: "2026-12-01", vigencia_fim: null },
    ];
    expect(configVigente(cs, "2026-10-14")?.id).toBe("b");
    expect(configVigente([], "2026-10-14")).toBeNull();
  });

  it("agrupa dias pela carga líquida e ignora folgas", () => {
    const r = jornadasDaConfig([
      { dow: 0, trabalha: false, turno_id: null },
      { dow: 1, trabalha: true, turno_id: null },
      { dow: 2, trabalha: true, turno_id: null },
      { dow: 6, trabalha: true, turno_id: null, entrada: "08:00", saida: "12:00", intervalo_minutos: 0 },
    ], "t1", turnos);
    expect(r.jornadas).toEqual([
      expect.objectContaining({ minutos: 440, qtd: 2 }),
      expect.objectContaining({ minutos: 240, qtd: 1 }),
    ]);
    expect(r.incompletos).toEqual([]);
  });

  it("não inventa horário: dia trabalhado sem turno nem horário vai para incompletos", () => {
    const r = jornadasDaConfig([
      { dow: 1, trabalha: true, turno_id: null },
      { dow: 2, trabalha: true, turno_id: "inexistente" },
    ], null, turnos);
    expect(r.jornadas).toEqual([]);
    expect(r.incompletos).toEqual([1, 2]);
  });
});
