import { describe, it, expect } from "vitest";
import {
  proximaMarcacao,
  consolidarDia,
  formatarSaldo,
  formatarDuracao,
  totalizarPeriodo,
  horaDaMarcacao,
  type Marcacao,
  calcularFechamento,
  pendenciasDoFechamento,
  espelhoParaCsv,
  type ResumoPontoDia,
} from "@/lib/dp/ponto";
import type { HorarioPrevisto } from "@/lib/dp/horario-previsto";

const iso = (h: number, m = 0) => {
  const d = new Date(2026, 6, 27, h, m, 0);
  return d.toISOString();
};

const previsto: HorarioPrevisto = {
  colaborador_id: "c1",
  data: "2026-07-27",
  trabalha: true,
  tipo: "trabalho",
  turno_id: "t1",
  entrada: "08:00",
  saida: "17:00",
  intervalo_minutos: 60,
  termina_no_dia_seguinte: false,
  carga_prevista_horas: 8,
  fonte: "escala_publicada",
  confirmado: true,
};

const m = (tipo: Marcacao["tipo"], h: number, min = 0): Marcacao => ({
  tipo,
  registrado_em: iso(h, min),
});

describe("ponto", () => {
  it("segue a ordem das marcações", () => {
    expect(proximaMarcacao([])).toBe("entrada");
    expect(proximaMarcacao([m("entrada", 8)])).toBe("intervalo_inicio");
    expect(proximaMarcacao([m("entrada", 8), m("intervalo_inicio", 12)])).toBe("intervalo_fim");
    expect(
      proximaMarcacao([m("entrada", 8), m("intervalo_inicio", 12), m("intervalo_fim", 13)]),
    ).toBe("saida");
    expect(proximaMarcacao([m("entrada", 8), m("saida", 17)])).toBeNull();
  });

  it("calcula horas trabalhadas descontando o intervalo", () => {
    const r = consolidarDia({
      data: "2026-07-27",
      previsto,
      marcacoes: [m("entrada", 8), m("intervalo_inicio", 12), m("intervalo_fim", 13), m("saida", 17)],
    });
    expect(r.status).toBe("completo");
    expect(r.intervaloMinutos).toBe(60);
    expect(r.minutosTrabalhados).toBe(480);
    expect(r.saldoMinutos).toBe(0);
    expect(r.atrasoMinutos).toBe(0);
  });

  it("aplica tolerância de atraso e apura hora extra", () => {
    const r = consolidarDia({
      data: "2026-07-27",
      previsto,
      marcacoes: [m("entrada", 8, 20), m("intervalo_inicio", 12), m("intervalo_fim", 13), m("saida", 18)],
    });
    expect(r.atrasoMinutos).toBe(15);
    expect(r.extraMinutos).toBe(40);
    expect(formatarSaldo(r.saldoMinutos)).toBe("+40min");
  });

  it("dia em curso não vira falta; dia encerrado sem marcação vira falta", () => {
    expect(consolidarDia({ data: "2026-07-27", previsto, marcacoes: [] }).status).toBe("sem_registro");
    expect(
      consolidarDia({ data: "2026-07-27", previsto, marcacoes: [], encerrado: true }).status,
    ).toBe("falta");
    expect(
      consolidarDia({ data: "2026-07-27", previsto, marcacoes: [m("entrada", 8)] }).status,
    ).toBe("em_andamento");
    expect(
      consolidarDia({ data: "2026-07-27", previsto, marcacoes: [m("entrada", 8)], encerrado: true }).status,
    ).toBe("incompleto");
  });

  it("dia de folga sem marcação fica como folga", () => {
    const folga = { ...previsto, trabalha: false, tipo: "folga" as const, carga_prevista_horas: 0 };
    const r = consolidarDia({ data: "2026-07-26", previsto: folga, marcacoes: [], encerrado: true });
    expect(r.status).toBe("folga");
    expect(r.minutosPrevistos).toBe(0);
  });

  it("formata durações e totaliza o período", () => {
    expect(formatarDuracao(450)).toBe("7h30");
    expect(formatarSaldo(-45)).toBe("-45min");
    expect(horaDaMarcacao(iso(9, 5))).toBe("09:05");

    const dias = [
      consolidarDia({
        data: "2026-07-27",
        previsto,
        marcacoes: [m("entrada", 8), m("intervalo_inicio", 12), m("intervalo_fim", 13), m("saida", 17)],
      }),
      consolidarDia({ data: "2026-07-28", previsto, marcacoes: [], encerrado: true }),
    ];
    const t = totalizarPeriodo(dias);
    expect(t.dias).toBe(2);
    expect(t.diasCompletos).toBe(1);
    expect(t.faltas).toBe(1);
    expect(t.minutosTrabalhados).toBe(480);
  });
});

describe("fechamento e banco de horas", () => {
  const dia = (over: Partial<ResumoPontoDia>): ResumoPontoDia => ({
    data: "2026-07-01",
    status: "completo",
    entrada: "08:00",
    saida: "17:00",
    intervaloMinutos: 60,
    minutosTrabalhados: 480,
    minutosPrevistos: 480,
    saldoMinutos: 0,
    atrasoMinutos: 0,
    extraMinutos: 0,
    faltamMarcacoes: [],
    ...over,
  });

  it("soma o saldo anterior no acumulado", () => {
    const r = calcularFechamento("2026-07", [dia({ saldoMinutos: 30 }), dia({ data: "2026-07-02", saldoMinutos: -10 })], 120);
    expect(r.saldoMinutos).toBe(20);
    expect(r.saldoAnteriorMinutos).toBe(120);
    expect(r.saldoAcumuladoMinutos).toBe(140);
  });

  it("aponta dias incompletos como pendência de fechamento", () => {
    const pend = pendenciasDoFechamento([dia({}), dia({ data: "2026-07-02", status: "incompleto" }), dia({ data: "2026-07-03", status: "falta" })]);
    expect(pend.map((d) => d.data)).toEqual(["2026-07-02"]);
  });

  it("gera CSV com cabeçalho e uma linha por dia", () => {
    const csv = espelhoParaCsv("Karine", "2026-07", [dia({})]);
    const linhas = csv.split("\n");
    expect(linhas).toHaveLength(2);
    expect(linhas[0].startsWith('Colaborador;Competencia')).toBe(true);
    expect(linhas[1]).toContain('"Karine"');
  });
});
