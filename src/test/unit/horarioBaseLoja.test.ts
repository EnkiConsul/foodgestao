import { describe, expect, it } from "vitest";
import {
  chaveHorarioBase, contarHorariosBase, horarioBaseMaisComum, sugerirModeloHorario,
  type ModeloHorarioRanking,
} from "@/lib/dp/modeloHorarioRanking";
import { diasPadrao, normalizarDias } from "@/lib/dp/config-trabalho";

const modelo = (
  entrada: string, saida: string, usado_em: string, cargo_id: string | null = null,
  dias = diasPadrao(),
): ModeloHorarioRanking => ({
  cargo_id,
  horario: { entrada, saida, intervalo_minutos: 60 },
  dias,
  folga_variavel: false,
  usado_em,
});

describe("horário base da loja", () => {
  it("conta quantos colaboradores usam cada horário base", () => {
    const c = contarHorariosBase([
      modelo("08:00", "17:00", "2026-01-01"),
      modelo("08:00", "17:00", "2026-02-01"),
      modelo("10:00", "19:00", "2026-03-01"),
    ]);
    expect(c.get(chaveHorarioBase({ entrada: "08:00", saida: "17:00", intervalo_minutos: 60 }))?.quantidade).toBe(2);
    expect(c.get(chaveHorarioBase({ entrada: "10:00", saida: "19:00", intervalo_minutos: 60 }))?.quantidade).toBe(1);
  });

  it("o mais repetido vence o mais recente e o primeiro cadastrado", () => {
    const base = horarioBaseMaisComum([
      modelo("07:00", "16:00", "2026-01-01"),
      modelo("10:00", "19:00", "2026-05-01"),
      modelo("10:00", "19:00", "2026-04-01"),
    ]);
    expect(base).toEqual({ entrada: "10:00", saida: "19:00", intervalo_minutos: 60 });
  });

  it("prefere o horário do mesmo cargo quando existe histórico no cargo", () => {
    const base = horarioBaseMaisComum([
      modelo("06:00", "15:00", "2026-01-01", "cargo-a"),
      modelo("10:00", "19:00", "2026-05-01", "cargo-b"),
      modelo("10:00", "19:00", "2026-04-01", "cargo-b"),
    ], "cargo-a");
    expect(base?.entrada).toBe("06:00");
  });

  it("a sugestão de jornada parte do horário base mais repetido", () => {
    const semanaVariada = normalizarDias(
      diasPadrao().map((d) => (d.dow === 6
        ? { ...d, entrada: "12:00", saida: "22:00", intervalo_minutos: 60 }
        : d)),
    );
    const escolhido = sugerirModeloHorario([
      // Mais recente, mas horário base usado por um único colaborador.
      modelo("07:00", "16:00", "2026-09-01"),
      modelo("10:00", "19:00", "2026-04-01"),
      modelo("10:00", "19:00", "2026-05-01", null, semanaVariada),
    ]);
    expect(escolhido?.horario?.entrada).toBe("10:00");
  });
});
