import { describe, expect, it } from "vitest";
import {
  diaDivergeDoBase, diasPadrao, horarioPadraoDaSemana, normalizarDias, preencherDiasComHorario,
  type DiaConfig,
} from "@/lib/dp/config-trabalho";

const BASE = { entrada: "08:00", saida: "17:00", intervalo_minutos: 60 };

const semana = (por: Record<number, { entrada?: string; saida?: string; folga?: boolean }>): DiaConfig[] =>
  normalizarDias(diasPadrao().map((d) => {
    const cfg = por[d.dow];
    if (!cfg) return d;
    if (cfg.folga) return { ...d, trabalha: false };
    return { ...d, entrada: cfg.entrada ?? null, saida: cfg.saida ?? null, intervalo_minutos: 60 };
  }));

describe("horário padrão derivado da semana", () => {
  it("usa o horário que mais se repete nos dias trabalhados", () => {
    const dias = semana({
      0: { folga: true },
      1: { entrada: "17:00", saida: "00:30" },
      2: { entrada: "17:00", saida: "00:30" },
      3: { entrada: "17:00", saida: "00:30" },
      4: { entrada: "12:00", saida: "22:00" },
      5: { entrada: "12:00", saida: "22:00" },
      6: { entrada: "17:00", saida: "00:30" },
    });
    expect(horarioPadraoDaSemana(dias, BASE)).toEqual({ entrada: "17:00", saida: "00:30", intervalo_minutos: 60 });
  });

  it("cai no fallback quando nenhum dia tem horário preenchido", () => {
    expect(horarioPadraoDaSemana(diasPadrao(), BASE)).toEqual(BASE);
  });

  it("preenche apenas os dias trabalhados sem horário próprio", () => {
    const dias = semana({ 0: { folga: true }, 6: { entrada: "12:00", saida: "22:00" } });
    const cheios = preencherDiasComHorario(dias, BASE);
    expect(cheios.find((d) => d.dow === 0)?.entrada ?? null).toBeNull();
    expect(cheios.find((d) => d.dow === 6)?.entrada).toBe("12:00");
    expect(cheios.find((d) => d.dow === 3)?.entrada).toBe("08:00");
    // Idempotente: nada a preencher devolve a mesma referência.
    expect(preencherDiasComHorario(cheios, BASE)).toBe(cheios);
  });

  it("ao salvar, só os dias divergentes do padrão têm horário próprio", () => {
    const dias = preencherDiasComHorario(
      semana({ 0: { folga: true }, 6: { entrada: "12:00", saida: "22:00" } }),
      BASE,
    );
    const padrao = horarioPadraoDaSemana(dias, BASE);
    const divergentes = dias.filter((d) => d.trabalha && diaDivergeDoBase(d, padrao)).map((d) => d.dow);
    expect(padrao.entrada).toBe("08:00");
    expect(divergentes).toEqual([6]);
  });
});
