import { describe, expect, it } from "vitest";
import {
  montarSemanaUniforme,
  sugerirModeloHorario,
  sugerirSemanaBaseCargo,
  type ModeloHorarioRanking,
} from "@/lib/dp/modeloHorarioRanking";

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

const semana = (folgaDow: number, entrada = "16:00", saida = "00:00") =>
  [0, 1, 2, 3, 4, 5, 6].map((dow) => ({
    dow,
    trabalha: dow !== folgaDow,
    turno_id: null,
    // Exceção individual de fim de semana (pico da loja): não pode vazar
    // para a sugestão de um novo colaborador.
    entrada: dow >= 5 ? "17:00" : entrada,
    saida: dow >= 5 ? "01:00" : saida,
    intervalo_minutos: 60,
  }));

const modeloSemana = (
  cargo: string,
  folgaDow: number,
  usadoEm: string,
  entrada = "16:00",
  saida = "00:00",
): ModeloHorarioRanking => ({
  cargo_id: cargo,
  horario: { entrada, saida, intervalo_minutos: 60 },
  folga_variavel: false,
  usado_em: usadoEm,
  dias: semana(folgaDow, entrada, saida),
});

describe("sugerirSemanaBaseCargo", () => {
  it("sugere o horário que mais se repete no cargo, uniforme na semana toda", () => {
    const modelos = [
      modeloSemana("atendente", 1, "2026-01-01"),
      modeloSemana("atendente", 2, "2026-02-01"),
      modeloSemana("atendente", 1, "2026-03-01"),
      modeloSemana("cozinha", 0, "2026-04-01", "08:00", "17:00"),
    ];
    const s = sugerirSemanaBaseCargo(modelos, "atendente");
    expect(s?.horario).toEqual({ entrada: "16:00", saida: "00:00", intervalo_minutos: 60 });
    // Folga mais comum entre os colegas do cargo (segunda, 2x).
    expect(s?.folgaDow).toBe(1);

    const dias = montarSemanaUniforme(s!);
    // Nunca 7 dias corridos: sempre 6 trabalhados + 1 folga.
    expect(dias.filter((d) => d.trabalha)).toHaveLength(6);
    expect(dias.find((d) => d.dow === 1)?.trabalha).toBe(false);
    // Todos os dias trabalhados no MESMO horário base — nada de sexta/sábado/
    // domingo diferentes por causa da exceção de um colega.
    for (const d of dias.filter((d) => d.trabalha)) {
      expect(d.entrada).toBe("16:00");
      expect(d.saida).toBe("00:00");
      expect(d.intervalo_minutos).toBe(60);
      expect(d.turno_id).toBeNull();
    }
  });

  it("ignora colega que trabalha 7 dias: a sugestão continua com folga", () => {
    const seteDias: ModeloHorarioRanking = {
      cargo_id: "atendente",
      horario: { entrada: "16:00", saida: "00:00", intervalo_minutos: 60 },
      folga_variavel: false,
      usado_em: "2026-05-01",
      dias: [0, 1, 2, 3, 4, 5, 6].map((dow) => ({ dow, trabalha: true, turno_id: null })),
    };
    const s = sugerirSemanaBaseCargo([seteDias], "atendente");
    expect(s).not.toBeNull();
    const dias = montarSemanaUniforme(s!);
    expect(dias.filter((d) => d.trabalha)).toHaveLength(6);
    expect(dias.filter((d) => !d.trabalha)).toHaveLength(1);
  });

  it("sem histórico do cargo, usa o horário mais comum da unidade", () => {
    const modelos = [
      modeloSemana("cozinha", 0, "2026-01-01", "08:00", "17:00"),
      modeloSemana("cozinha", 0, "2026-02-01", "08:00", "17:00"),
      modeloSemana("salao", 3, "2026-03-01"),
    ];
    const s = sugerirSemanaBaseCargo(modelos, "gerencia");
    expect(s?.horario.entrada).toBe("08:00");
    expect(s?.folgaDow).toBe(0);
  });

  it("sem nenhum modelo, não sugere nada", () => {
    expect(sugerirSemanaBaseCargo([], "atendente")).toBeNull();
  });
});