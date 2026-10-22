import { describe, it, expect } from "vitest";
import { mesclarFolgasAgendadas } from "../compensacao/desligamentoFolgas";
import { simularDesligamento, type ResultadoDesligamento } from "../compensacao/desligamentoMotor";

// Jornada seg–sáb 8h, domingo folga (índice 0 = domingo).
const JORNADA: [number, number, number, number, number, number, number] = [0, 480, 480, 480, 480, 480, 480];
const BASE = { dataAdmissao: "2024-01-10", dataComunicacao: "2026-10-01", jornadaSemanal: JORNADA };
const ok = (r: ReturnType<typeof simularDesligamento>) => {
  if ("erro" in r) throw new Error(r.erro);
  return r as ResultadoDesligamento;
};

describe("mesclarFolgasAgendadas (folga agendada = dia sem trabalho, nunca saldo)", () => {
  it("folga sem item de escala vira exceção de jornada zero", () => {
    const m = mesclarFolgasAgendadas([], [{ data: "2026-10-20", tipo: "normal", direito_origem: "fds" }]);
    expect(m.excecoes).toEqual([{ data: "2026-10-20", minutos: 0 }]);
    expect(m.consideradas).toEqual(["2026-10-20"]);
    expect(m.conflitos).toEqual([]);
  });

  it("conflito: escala publicada manda trabalhar no dia da folga → revisão, sem escolher fonte", () => {
    const m = mesclarFolgasAgendadas(
      [{ data: "2026-10-20", minutos: 480 }],
      [{ data: "2026-10-20", tipo: "normal" }],
    );
    expect(m.conflitos).toEqual(["2026-10-20"]);
    expect(m.consideradas).toEqual([]);
    // A exceção da escala é preservada (nada é zerado em silêncio).
    expect(m.excecoes).toEqual([{ data: "2026-10-20", minutos: 480 }]);
  });

  it("escala já marca o dia sem trabalho: folga é consistente, sem duplicar exceção", () => {
    const m = mesclarFolgasAgendadas(
      [{ data: "2026-10-20", minutos: 0 }],
      [{ data: "2026-10-20", tipo: "extra" }, { data: "2026-10-20", tipo: "extra" }],
    );
    expect(m.conflitos).toEqual([]);
    expect(m.consideradas).toEqual(["2026-10-20"]);
    expect(m.excecoes).toEqual([{ data: "2026-10-20", minutos: 0 }]);
  });
});

describe("caso B via folga agendada (exceção zero), sem saldo fictício", () => {
  const DISPENSA = { ...BASE, motivo: "dispensa_sem_justa_causa" as const, modalidade: "trabalhado" as const, reducao: "sete_dias" as const };

  it("folga regular agendada antes da ausência legal antecipa o último comparecimento; término e 10º dia inalterados", () => {
    // Folgas agendadas em 23/10 (sex) e 24/10 (sáb) entram como exceção zero — sem saldo de banco.
    const mescla = mesclarFolgasAgendadas([], [{ data: "2026-10-23", tipo: "normal", direito_origem: null }, { data: "2026-10-24", tipo: "normal" }]);
    const r = ok(simularDesligamento({ ...DISPENSA, excecoesJornada: mescla.excecoes, saldoBancoMinutos: 0, folgasCompensatorias: [] }));
    expect(r.ultimoComparecimento).toBe("2026-10-22"); // última presença antes das folgas e dos 7 dias
    expect(r.dataEfetiva).toBe("2026-10-31");
    expect(r.prazoQuitacao).toBe("2026-11-10");
    expect(r.minutosCompensados).toBe(0);
    expect(r.saldoResidualMinutos).toBe(0);
  });

  it("folga coincidente com a ausência legal de 7 dias não é contada duas vezes", () => {
    const mescla = mesclarFolgasAgendadas([], [{ data: "2026-10-27", tipo: "normal" }]);
    const r = ok(simularDesligamento({ ...DISPENSA, excecoesJornada: mescla.excecoes }));
    // 27/10 já é ausência legal (25–31/10): prevalece a ausência, último comparecimento segue 24/10.
    expect(r.periodoReducao).toEqual({ inicio: "2026-10-25", fim: "2026-10-31" });
    expect(r.ultimoComparecimento).toBe("2026-10-24");
    expect(r.dataEfetiva).toBe("2026-10-31");
  });
});
