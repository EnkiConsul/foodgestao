import { describe, it, expect } from "vitest";
import {
  simularDesligamento, duracaoAvisoProporcional, anosCompletos,
  type ParametrosDesligamento, type ResultadoDesligamento,
} from "@/lib/dp/compensacao/desligamentoMotor";

// seg–sex 8h, sábado 4h, domingo sem expediente
const SEMANA: ParametrosDesligamento["jornadaSemanal"] = [0, 480, 480, 480, 480, 480, 240];

const base = (o: Partial<ParametrosDesligamento> = {}): ParametrosDesligamento => ({
  dataAdmissao: "2026-01-05",
  dataComunicacao: "2026-10-01", // quinta
  modalidade: "trabalhado",
  reducao: "duas_horas",
  jornadaSemanal: SEMANA,
  ...o,
});
const ok = (p: ParametrosDesligamento): ResultadoDesligamento => {
  const r = simularDesligamento(p);
  if ("erro" in r) throw new Error(r.erro);
  return r;
};

describe("início da contagem (Súmula 380, sem adiamento)", () => {
  it("comunicação na sexta começa no sábado", () => {
    expect(ok(base({ dataComunicacao: "2026-10-02" })).inicioAviso).toBe("2026-10-03");
  });
  it("comunicação no sábado começa no domingo", () => {
    expect(ok(base({ dataComunicacao: "2026-10-03" })).inicioAviso).toBe("2026-10-04");
  });
  it("véspera de feriado começa no feriado", () => {
    const r = ok(base({ dataComunicacao: "2026-10-11", feriados: ["2026-10-12"] }));
    expect(r.inicioAviso).toBe("2026-10-12");
    expect(r.calendario[0].classificacao).toBe("folga_regular");
  });
});

describe("duração proporcional (Lei 12.506)", () => {
  it.each([[0, 30], [1, 33], [5, 45], [20, 90], [35, 90]])("%i anos → %i dias", (a, d) => {
    expect(duracaoAvisoProporcional(a)).toBe(d);
  });
  it("anos completos respeita o aniversário", () => {
    expect(anosCompletos("2025-10-02", "2026-10-01")).toBe(0);
    expect(anosCompletos("2025-10-01", "2026-10-01")).toBe(1);
  });
  it("33 dias: término projetado e 3 dias indenizados", () => {
    const r = ok(base({ dataAdmissao: "2025-10-01" }));
    expect(r.duracaoLegalDias).toBe(33);
    expect(r.fimPeriodoCumprido).toBe("2026-10-31");
    expect(r.terminoProjetado).toBe("2026-11-03");
    expect(r.diasProjetadosIndenizados).toBe(3);
  });
  it("90 dias", () => {
    const r = ok(base({ dataAdmissao: "2000-01-01" }));
    expect(r.duracaoLegalDias).toBe(90);
    expect(r.terminoProjetado).toBe("2026-12-30");
  });
});

describe("trabalhado × indenizado", () => {
  it("indenizado não tem jornadas e rejeita folgas", () => {
    const r = ok(base({ modalidade: "indenizado", reducao: null, folgasCompensatorias: ["2026-10-05"] }));
    expect(r.calendario).toHaveLength(0);
    expect(r.ultimoComparecimento).toBeNull();
    expect(r.terminoProjetado).toBe("2026-10-31");
    expect(r.baseQuitacao).toBe("2026-10-01");
    expect(r.prazoQuitacao).toBe("2026-10-11"); // domingo
    expect(r.sugestaoPagamentoDiaUtilAnterior).toBe("2026-10-09"); // sexta anterior
    expect(r.dispensadoDeComparecerDesde).toBe("2026-10-02");
    expect(r.folgasRejeitadas[0].motivo).toBe("aviso_indenizado");
  });
  it("trabalhado exige escolha da redução", () => {
    expect(simularDesligamento(base({ reducao: null }))).toHaveProperty("erro");
  });
  it("quitação a partir do fim do cumprido", () => {
    expect(ok(base()).prazoQuitacao).toBe("2026-11-10");
  });
});

describe("art. 488", () => {
  it("duas horas reduz cada jornada", () => {
    const r = ok(base());
    const seg = r.calendario.find((d) => d.data === "2026-10-05")!;
    expect(seg.jornadaPrevista).toBe(360);
    const sab = r.calendario.find((d) => d.data === "2026-10-03")!;
    expect(sab.jornadaPrevista).toBe(120);
  });
  it("sete dias corridos ao final", () => {
    const r = ok(base({ reducao: "sete_dias" }));
    expect(r.periodoReducao).toEqual({ inicio: "2026-10-25", fim: "2026-10-31" });
    expect(r.calendario.filter((d) => d.classificacao === "ausencia_legal_aviso")).toHaveLength(7);
    expect(r.ultimoComparecimento).toBe("2026-10-24");
    expect(r.ultimoComparecimento).not.toBe(r.terminoProjetado);
  });
});

describe("calendário e folgas compensatórias", () => {
  it("jornadas variáveis e dias sem expediente", () => {
    const r = ok(base({
      reducao: "sete_dias",
      jornadaSemanal: [0, 0, 600, 0, 600, 0, 0], // ter e qui 10h
      excecoesJornada: [{ data: "2026-10-06", minutos: 0 }],
    }));
    expect(r.calendario.find((d) => d.data === "2026-10-06")!.classificacao).toBe("folga_regular");
    // ter/qui de 02/10 a 24/10, menos 06/10
    expect(r.jornadasRestantes).toBe(5);
    expect(r.ultimoComparecimento).toBe("2026-10-22");
  });
  it("folgas distribuídas abatem saldo", () => {
    const r = ok(base({ reducao: "sete_dias", saldoBancoMinutos: 1000, folgasCompensatorias: ["2026-10-06", "2026-10-14"] }));
    expect(r.folgasAceitas).toEqual(["2026-10-06", "2026-10-14"]);
    expect(r.minutosCompensados).toBe(960);
    expect(r.saldoResidualMinutos).toBe(40);
    expect(r.ultimoComparecimento).toBe("2026-10-24");
  });
  it("folgas nas últimas jornadas antecipam o último comparecimento (não por subtração)", () => {
    // últimas jornadas antes da ausência legal: sáb 24 (4h), sex 23, qui 22
    const r = ok(base({ reducao: "sete_dias", saldoBancoMinutos: 1200, folgasCompensatorias: ["2026-10-24", "2026-10-23", "2026-10-22"] }));
    expect(r.minutosCompensados).toBe(1200);
    expect(r.ultimoComparecimento).toBe("2026-10-21");
  });
  it("folga que ultrapassa o saldo é rejeitada", () => {
    const r = ok(base({ reducao: "sete_dias", saldoBancoMinutos: 500, folgasCompensatorias: ["2026-10-05", "2026-10-06"] }));
    expect(r.folgasAceitas).toEqual(["2026-10-05"]);
    expect(r.folgasRejeitadas).toEqual([{ data: "2026-10-06", motivo: "excede_saldo" }]);
    expect(r.saldoResidualMinutos).toBe(20);
  });
  it("sem jornadas futuras", () => {
    const r = ok(base({ jornadaSemanal: [0, 0, 0, 0, 0, 0, 0] }));
    expect(r.ultimoComparecimento).toBeNull();
    expect(r.jornadasRestantes).toBe(0);
  });
  it("sem dupla contagem: DSR, ausência legal, duplicada e fora do período", () => {
    const r = ok(base({
      reducao: "sete_dias", saldoBancoMinutos: 10000,
      folgasCompensatorias: ["2026-10-04", "2026-10-26", "2026-10-05", "2026-10-05", "2026-11-02"],
    }));
    expect(r.folgasAceitas).toEqual(["2026-10-05"]);
    expect(r.minutosCompensados).toBe(480);
    const motivos = r.folgasRejeitadas.map((f) => f.motivo).sort();
    expect(motivos).toEqual(["dia_de_ausencia_legal", "dia_sem_jornada", "duplicada", "fora_do_periodo_trabalhado"]);
    const soma = r.calendario.reduce((s, d) => s + d.minutosCompensados, 0);
    expect(soma).toBe(r.minutosCompensados);
    expect(new Set(r.calendario.map((d) => d.data)).size).toBe(r.calendario.length);
  });
  it("com duas horas a folga abate só a jornada reduzida", () => {
    const r = ok(base({ saldoBancoMinutos: 360, folgasCompensatorias: ["2026-10-05"] }));
    expect(r.minutosCompensados).toBe(360);
    expect(r.saldoResidualMinutos).toBe(0);
  });
});

describe("Fase 1 — 10º dia bruto e sugestão anterior", () => {
  const ind = (com: string, feriados?: string[]) => ok(base({ modalidade: "indenizado", reducao: null, dataComunicacao: com, feriados }));
  it("dia útil: sugestão igual ao prazo", () => {
    const r = ind("2026-10-05"); // +10 = qui 15/10
    expect(r.prazoQuitacao).toBe("2026-10-15");
    expect(r.sugestaoPagamentoDiaUtilAnterior).toBe("2026-10-15");
  });
  it("sábado: prazo mantido, sugestão na sexta", () => {
    const r = ind("2026-10-07"); // +10 = sáb 17/10
    expect(r.prazoQuitacao).toBe("2026-10-17");
    expect(r.sugestaoPagamentoDiaUtilAnterior).toBe("2026-10-16");
  });
  it("feriado: prazo mantido, sugestão no útil anterior", () => {
    const r = ind("2026-10-02", ["2026-10-12"]); // +10 = seg 12/10 feriado
    expect(r.prazoQuitacao).toBe("2026-10-12");
    expect(r.sugestaoPagamentoDiaUtilAnterior).toBe("2026-10-09");
  });
  it("misto 42 dias: base é o fim do cumprido, não a projeção", () => {
    const r = ok(base({ dataAdmissao: "2022-09-01" })); // 4 anos → 42
    expect(r.duracaoLegalDias).toBe(42);
    expect(r.diasProjetadosIndenizados).toBe(12);
    expect(r.fimPeriodoCumprido).toBe("2026-10-31");
    expect(r.terminoProjetado).toBe("2026-11-12");
    expect(r.baseQuitacao).toBe("2026-10-31");
    expect(r.prazoQuitacao).toBe("2026-11-10");
    expect(r.ultimoComparecimento).toBe("2026-10-31");
    expect(r.dispensadoDeComparecerDesde).toBeNull();
  });
  it("sete dias não antecipa a data contratual nem a base", () => {
    const r = ok(base({ reducao: "sete_dias" }));
    expect(r.ultimoComparecimento).toBe("2026-10-24");
    expect(r.fimPeriodoCumprido).toBe("2026-10-31");
    expect(r.baseQuitacao).toBe("2026-10-31");
  });
  it("pura: mesma entrada, mesma saída, sem mutar parâmetros", () => {
    const p = base({ saldoBancoMinutos: 600, folgasCompensatorias: ["2026-10-30", "2026-10-05"] });
    const copia = JSON.parse(JSON.stringify(p));
    expect(ok(p)).toEqual(ok(p));
    expect(p).toEqual(copia);
  });
});

describe("feriado × escala publicada (food service trabalha em feriado)", () => {
  it("sem escala no feriado, o dia é sem jornada", () => {
    expect(ok(base({ feriados: ["2026-10-31"] })).ultimoComparecimento).toBe("2026-10-30");
  });
  it("escala publicada com trabalho no feriado prevalece", () => {
    const r = ok(base({ feriados: ["2026-10-31"], excecoesJornada: [{ data: "2026-10-31", minutos: 240 }] }));
    expect(r.ultimoComparecimento).toBe("2026-10-31");
    expect(r.baseQuitacao).toBe("2026-10-31");
    expect(r.prazoQuitacao).toBe("2026-11-10");
  });
  it("escala com folga explícita zera dia útil comum", () => {
    expect(ok(base({ excecoesJornada: [{ data: "2026-10-31", minutos: 0 }] })).ultimoComparecimento).toBe("2026-10-30");
  });
  it("10º dia bruto e sugestão anterior seguem o calendário de feriados", () => {
    const r = ok(base({ feriados: ["2026-11-10"], excecoesJornada: [{ data: "2026-11-10", minutos: 480 }] }));
    expect(r.prazoQuitacao).toBe("2026-11-10");
    expect(r.sugestaoPagamentoDiaUtilAnterior).toBe("2026-11-09");
  });
});
