import { describe, it, expect } from "vitest";
import { apurarColaborador, apuracaoParaCsv, semanaDe, somarApuracoes } from "@/lib/dp/apuracao";
import type { ResumoPontoDia } from "@/lib/dp/ponto";

const dia = (over: Partial<ResumoPontoDia>): ResumoPontoDia => ({
  data: "2026-07-01",
  status: "completo",
  entrada: "08:00",
  saida: "17:00",
  intervaloMinutos: 60,
  minutosTrabalhados: 480,
  minutosPrevistos: 480,
  minutosNoturnos: 0,
  saldoMinutos: 0,
  atrasoMinutos: 0,
  extraMinutos: 0,
  faltamMarcacoes: [],
  ...over,
});

describe("apuração para folha", () => {
  it("separa normais, extras 50% e extras 100%", () => {
    const r = apurarColaborador([
      dia({ data: "2026-07-01", minutosTrabalhados: 540, saldoMinutos: 60 }), // quarta: 1h extra 50%
      dia({ data: "2026-07-05", minutosPrevistos: 0, minutosTrabalhados: 300 }), // domingo: 100%
    ]);
    expect(r.minutosNormais).toBe(480);
    expect(r.minutosExtras50).toBe(60);
    expect(r.minutosExtras100).toBe(300);
  });

  it("conta faltas e perde um DSR por semana com falta", () => {
    const r = apurarColaborador([
      dia({ data: "2026-07-01", status: "falta", minutosTrabalhados: 0 }),
      dia({ data: "2026-07-02", status: "falta", minutosTrabalhados: 0 }),
      dia({ data: "2026-07-09", status: "falta", minutosTrabalhados: 0 }),
    ]);
    expect(r.diasFalta).toBe(3);
    expect(r.minutosFalta).toBe(1440);
    expect(r.dsrPerdidos).toBe(2);
  });

  it("acumula adicional noturno e atrasos", () => {
    const r = apurarColaborador([dia({ minutosNoturnos: 120, atrasoMinutos: 15 })]);
    expect(r.minutosNoturnos).toBe(120);
    expect(r.minutosAtraso).toBe(15);
  });

  it("monetiza as rubricas quando há valor hora", () => {
    const r = apurarColaborador([dia({ minutosTrabalhados: 540, minutosNoturnos: 60 })], { valorHora: 10 });
    expect(r.valores?.normais).toBeCloseTo(80);
    expect(r.valores?.extras50).toBeCloseTo(15);
    expect(r.valores?.noturno).toBeCloseTo(2);
  });

  it("semanaDe agrupa pela segunda-feira", () => {
    expect(semanaDe("2026-07-01")).toBe(semanaDe("2026-07-04"));
    expect(semanaDe("2026-07-01")).not.toBe(semanaDe("2026-07-09"));
  });

  it("soma e exporta o time em CSV", () => {
    const linhas = [
      { colaborador_id: "a", nome: "Ana", rubricas: apurarColaborador([dia({})]), saldoAcumuladoMinutos: 30, fechado: false },
      { colaborador_id: "b", nome: "Bruno", rubricas: apurarColaborador([dia({})]), saldoAcumuladoMinutos: -30, fechado: true },
    ];
    expect(somarApuracoes(linhas).minutosNormais).toBe(960);
    const csv = apuracaoParaCsv("2026-07", linhas);
    expect(csv.split("\n")).toHaveLength(3);
    expect(csv).toContain("Ana");
    expect(csv).toContain("Fechado");
  });
});

describe("Fase 12 — monetização e folha", () => {
  it("calcula o valor da hora pelo divisor carga x 5", () => {
    expect(valorHoraDe(2200, 44)).toBeCloseTo(10);
    expect(valorHoraDe(0, 44)).toBeUndefined();
    expect(valorHoraDe(2200, null)).toBeCloseTo(10);
  });

  it("converte a apuração monetizada em lançamento de folha", () => {
    const linha = {
      colaborador_id: "c1",
      nome: "Maria",
      rubricas: apurarColaborador(
        [
          {
            data: "2026-07-06",
            status: "completo",
            minutosPrevistos: 480,
            minutosTrabalhados: 540,
            minutosNoturnos: 0,
            atrasoMinutos: 0,
            saldoMinutos: 60,
          },
        ] as never,
        { valorHora: 10 },
      ),
      saldoAcumuladoMinutos: 60,
      fechado: false,
    };
    const lanc = apuracaoParaLancamento(linha)!;
    expect(lanc.valor_bruto).toBeCloseTo(95);
    expect(lanc.valor_liquido).toBeCloseTo(95);
    expect(lanc.descontos.horas.extras50).toBe(60);
  });

  it("ignora colaborador sem valor hora", () => {
    expect(
      apuracaoParaLancamento({
        colaborador_id: "c2",
        nome: "Sem salário",
        rubricas: apurarColaborador([]),
        saldoAcumuladoMinutos: 0,
        fechado: false,
      }),
    ).toBeNull();
  });
});
