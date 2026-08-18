import { describe, expect, it } from "vitest";
import { colegasNoHorarioDoDia, diaEhHorarioDaLoja, type DiaConfig } from "@/lib/dp/config-trabalho";
import { contarHorariosUsados, type ModeloHorarioRanking } from "@/lib/dp/modeloHorarioRanking";

const dia = (over: Partial<DiaConfig>): DiaConfig => ({
  dow: 5,
  trabalha: true,
  turno_id: null,
  entrada: null,
  saida: null,
  intervalo_minutos: null,
  ...over,
} as DiaConfig);

const modelo = (over: Partial<ModeloHorarioRanking>): ModeloHorarioRanking => ({
  cargo_id: null,
  horario: { entrada: "17:00", saida: "00:35", intervalo_minutos: 30 },
  dias: [],
  folga_variavel: false,
  usado_em: "2026-08-01",
  ...over,
});

describe("horário da loja x horário próprio", () => {
  it("conta o horário base e os horários próprios de cada dia", () => {
    const usos = contarHorariosUsados([
      modelo({}),
      modelo({
        dias: [dia({ dow: 6, entrada: "16:30", saida: "00:35", intervalo_minutos: 30 })],
      }),
    ]);
    expect(usos.get("17:00|00:35|30")).toBe(2);
    expect(usos.get("16:30|00:35|30")).toBe(1);
  });

  it("marca como da loja o horário usado por colegas", () => {
    const usos = contarHorariosUsados([modelo({}), modelo({ usado_em: "2026-08-02" })]);
    const d = dia({ entrada: "17:00", saida: "00:35", intervalo_minutos: 30 });
    expect(diaEhHorarioDaLoja(d, usos)).toBe(true);
    expect(colegasNoHorarioDoDia(d, usos)).toBe(2);
  });

  it("mantém como horário próprio o horário exclusivo do colaborador", () => {
    const usos = contarHorariosUsados([modelo({})]);
    // 00:30 só existe para esta pessoa, mesmo que o turno já tenha sido criado.
    const d = dia({ entrada: "17:00", saida: "00:30", intervalo_minutos: 30 });
    expect(diaEhHorarioDaLoja(d, usos)).toBe(false);
    expect(colegasNoHorarioDoDia(d, usos)).toBe(0);
  });
});
