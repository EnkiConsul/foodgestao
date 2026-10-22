import { describe, it, expect } from "vitest";
import { simularDesligamento, type ResultadoDesligamento } from "../compensacao/desligamentoMotor";

// Jornada seg–sáb 8h, domingo folga (índice 0 = domingo).
const JORNADA: [number, number, number, number, number, number, number] = [0, 480, 480, 480, 480, 480, 480];
const BASE = { dataAdmissao: "2024-01-10", dataComunicacao: "2026-10-01", jornadaSemanal: JORNADA };
const ok = (r: ReturnType<typeof simularDesligamento>) => {
  if ("erro" in r) throw new Error(r.erro);
  return r as ResultadoDesligamento;
};

describe("pedido de demissão (art. 487 §2º)", () => {
  it("trabalhado: 30 dias fixos, sem proporcional e sem redução do art. 488", () => {
    // 5 anos de casa: na dispensa seriam 45 dias; no pedido, sempre 30.
    const r = ok(simularDesligamento({ ...BASE, dataAdmissao: "2021-01-10", motivo: "pedido_demissao", modalidade: "trabalhado" }));
    expect(r.duracaoLegalDias).toBe(30);
    expect(r.diasProporcionais).toBe(0);
    expect(r.diasProjetadosIndenizados).toBe(0);
    expect(r.fimPeriodoCumprido).toBe("2026-10-31");
    expect(r.dataEfetiva).toBe("2026-10-31");
    expect(r.baseQuitacao).toBe("2026-10-31");
    expect(r.prazoQuitacao).toBe("2026-11-10"); // 10º dia corrido bruto
    expect(r.periodoReducao).toBeNull();
    // Jornada integral: nenhum dia com redução de 2h.
    expect(r.calendario.filter((d) => d.classificacao === "trabalho_previsto").every((d) => d.jornadaPrevista === 480)).toBe(true);
  });

  it("trabalhado: redução informada é recusada", () => {
    const r = simularDesligamento({ ...BASE, motivo: "pedido_demissao", modalidade: "trabalhado", reducao: "sete_dias" });
    expect("erro" in r && r.erro).toMatch(/art\. 488/);
  });

  it("dispensado sem desconto: término na data do pedido, prazo do 10º dia, sem prova de novo emprego", () => {
    const r = ok(simularDesligamento({ ...BASE, motivo: "pedido_demissao", modalidade: "indenizado", descontarAviso: false }));
    expect(r.avisoDispensado).toBe(true);
    expect(r.descontarAviso).toBe(false);
    expect(r.dataEfetiva).toBe("2026-10-01");
    expect(r.baseQuitacao).toBe("2026-10-01");
    expect(r.prazoQuitacao).toBe("2026-10-11");
    expect(r.dispensadoDeComparecerDesde).toBe("2026-10-02");
    expect(r.ultimoComparecimento).toBeNull();
    expect(r.diasProjetadosIndenizados).toBe(30);
    expect(r.avisos.join(" ")).toMatch(/não exige comprovação de novo emprego/);
  });

  it("dispensado com término acordado futuro: vínculo até a data acordada", () => {
    const r = ok(simularDesligamento({ ...BASE, motivo: "pedido_demissao", modalidade: "indenizado", dataTerminoAcordada: "2026-10-15", descontarAviso: true }));
    expect(r.dataEfetiva).toBe("2026-10-15");
    expect(r.prazoQuitacao).toBe("2026-10-25");
    expect(r.descontarAviso).toBe(true);
    expect(r.diasProjetadosIndenizados).toBe(16); // 31/10 - 15/10
    expect(r.avisos.join(" ")).toMatch(/tema controverso/);
  });

  it("dispensado: término acordado além dos 30 dias é recusado", () => {
    const r = simularDesligamento({ ...BASE, motivo: "pedido_demissao", modalidade: "indenizado", dataTerminoAcordada: "2026-11-05" });
    expect("erro" in r && r.erro).toMatch(/30 dias/);
  });
});

describe("acordo mútuo (art. 484-A)", () => {
  it("indenizado: aviso pela metade, arredondado para cima", () => {
    // 5 anos → proporcional 45 → metade 22,5 → 23.
    const r = ok(simularDesligamento({ ...BASE, dataAdmissao: "2021-01-10", motivo: "acordo_mutuo", modalidade: "indenizado" }));
    expect(r.duracaoLegalDias).toBe(23);
    expect(r.diasProjetadosIndenizados).toBe(23);
    expect(r.dataEfetiva).toBe("2026-10-01");
    expect(r.prazoQuitacao).toBe("2026-10-11");
  });

  it("trabalhado: cumpre a metade com redução opcional", () => {
    const r = ok(simularDesligamento({ ...BASE, dataAdmissao: "2021-01-10", motivo: "acordo_mutuo", modalidade: "trabalhado", reducao: "sete_dias" }));
    expect(r.fimPeriodoCumprido).toBe("2026-10-24"); // 23 dias a partir de 01/10
    expect(r.diasProjetadosIndenizados).toBe(0);
    expect(r.periodoReducao).toEqual({ inicio: "2026-10-18", fim: "2026-10-24" });
  });
});

describe("motivos sem aviso prévio", () => {
  it("justa causa: a data informada é o término; prazo de 10 dias conta dela", () => {
    const r = ok(simularDesligamento({ ...BASE, motivo: "dispensa_com_justa_causa", modalidade: "indenizado" }));
    expect(r.semAviso).toBe(true);
    expect(r.duracaoLegalDias).toBe(0);
    expect(r.dataEfetiva).toBe("2026-10-01");
    expect(r.baseQuitacao).toBe("2026-10-01");
    expect(r.prazoQuitacao).toBe("2026-10-11");
    expect(r.calendario).toEqual([]);
    expect(r.ultimoComparecimento).toBeNull();
    expect(r.dispensadoDeComparecerDesde).toBeNull();
  });

  it("término de contrato: mesma regra, 10º dia corrido bruto mesmo caindo em fim de semana", () => {
    // Término 2026-10-20 → prazo 2026-10-30 (sexta); término 2026-10-21 → 2026-10-31 (sábado, NÃO desloca).
    const r = ok(simularDesligamento({ ...BASE, dataComunicacao: "2026-10-21", motivo: "termino_contrato", modalidade: "indenizado" }));
    expect(r.prazoQuitacao).toBe("2026-10-31");
    expect(r.sugestaoPagamentoDiaUtilAnterior).toBe("2026-10-30"); // sugestão recua ao útil anterior
  });
});

describe("caso B: dispensa com redução de 7 dias + folga compensatória aprovada", () => {
  const DISPENSA = { ...BASE, motivo: "dispensa_sem_justa_causa" as const, modalidade: "trabalhado" as const, reducao: "sete_dias" as const };

  it("folga aprovada antes da ausência legal antecipa o último comparecimento, sem mudar o término", () => {
    const sem = ok(simularDesligamento({ ...DISPENSA, saldoBancoMinutos: 480 }));
    // 30 dias: fim do cumprimento 31/10; ausência legal 25–31/10; último trabalho 24/10 (sábado).
    expect(sem.fimPeriodoCumprido).toBe("2026-10-31");
    expect(sem.periodoReducao).toEqual({ inicio: "2026-10-25", fim: "2026-10-31" });
    expect(sem.ultimoComparecimento).toBe("2026-10-24");

    const com = ok(simularDesligamento({ ...DISPENSA, saldoBancoMinutos: 480, folgasCompensatorias: ["2026-10-23"] }));
    expect(com.folgasAceitas).toEqual(["2026-10-23"]);
    expect(com.ultimoComparecimento).toBe("2026-10-22"); // última presença antes dos 7 dias
    expect(com.dataEfetiva).toBe("2026-10-31"); // término NÃO antecipa
    expect(com.prazoQuitacao).toBe("2026-11-10");
  });

  it("folga dentro da ausência legal é rejeitada (dia já coberto)", () => {
    const r = ok(simularDesligamento({ ...DISPENSA, saldoBancoMinutos: 480, folgasCompensatorias: ["2026-10-27"] }));
    expect(r.folgasAceitas).toEqual([]);
    expect(r.folgasRejeitadas).toEqual([{ data: "2026-10-27", motivo: "dia_de_ausencia_legal" }]);
  });
});

describe("regressão v1: dispensa sem justa causa inalterada", () => {
  it("sem motivo informado, mantém proporcional, misto e redução", () => {
    const r = ok(simularDesligamento({ ...BASE, dataAdmissao: "2021-01-10", modalidade: "trabalhado", reducao: "duas_horas" }));
    expect(r.motivo).toBe("dispensa_sem_justa_causa");
    expect(r.duracaoLegalDias).toBe(45); // 30 + 3×5
    expect(r.fimPeriodoCumprido).toBe("2026-10-31"); // 30 dias cumpridos
    expect(r.diasProjetadosIndenizados).toBe(15);
    expect(r.terminoProjetado).toBe("2026-11-15");
    expect(r.dataEfetiva).toBe("2026-10-31");
    expect(r.semAviso).toBe(false);
    expect(r.avisoDispensado).toBe(false);
  });
});
