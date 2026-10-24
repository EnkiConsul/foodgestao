import { describe, expect, it } from "vitest";
import { simularDesligamento } from "../compensacao/desligamentoMotor";
import { diagnosticarEscalaAviso, concentrarBancoNoFinal, type RegraDescansoAviso } from "../desligamento-escala-diagnostico";

const regra: RegraDescansoAviso = { origem: "unidade", modo: "por_mes", semanas: 4, porMes: 1, dias: [0] };
function base(folgas: string[] = [], reducao: "sete_dias" | "duas_horas" = "sete_dias") {
  const r = simularDesligamento({ dataAdmissao: "2026-01-01", dataComunicacao: "2026-10-01", modalidade: "trabalhado", reducao,
    jornadaSemanal: [440,440,0,440,440,440,440], excecoesJornada: folgas.map((data) => ({ data, minutos: 0 })) });
  if ("erro" in r) throw new Error(r.erro);
  return r;
}
describe("Calendário antes do banco no aviso", () => {
  it("pede revisão mesmo com domingo marcado depois do limite sem banco", () => {
    const d = diagnosticarEscalaAviso(base(["2026-10-11"]), regra, ["2026-10-11", "2026-10-25"]);
    expect(d.limiteSemBanco).toBe("2026-10-24");
    expect(d.posteriores).toEqual(["2026-10-25"]);
    expect(d.apto).toBe(false);
  });
  it("usa a quantidade da unidade e não um piso CLT fixo", () => {
    const b = base(["2026-10-11"]);
    expect(diagnosticarEscalaAviso(b, regra, []).apto).toBe(true);
    expect(diagnosticarEscalaAviso(b, { ...regra, porMes: 2 }, []).apto).toBe(false);
  });
  it("detecta espaçamento quinzenal mesmo havendo duas folgas próximas", () => {
    const b = base(["2026-10-04", "2026-10-11"], "duas_horas");
    expect(diagnosticarEscalaAviso(b, { ...regra, modo: "semanas", semanas: 2 }, []).apto).toBe(false);
  });
  it("concentra 12h em um dia de 7h20, deixa 4h40 e pula DSR e os 7 dias legais", () => {
    const b = base(["2026-10-23"]);
    expect(concentrarBancoNoFinal(b, 720)).toEqual(["2026-10-24"]);
    const r = simularDesligamento({ dataAdmissao: "2026-01-01", dataComunicacao: "2026-10-01", modalidade: "trabalhado", reducao: "sete_dias", jornadaSemanal: [440,440,0,440,440,440,440], folgasCompensatorias: ["2026-10-24"], saldoBancoMinutos: 720 });
    if ("erro" in r) throw new Error(r.erro);
    expect(r.saldoResidualMinutos).toBe(280);
    expect(r.dataEfetiva).toBe("2026-10-31");
    expect(r.prazoQuitacao).toBe("2026-11-10");
  });
  it("não usa os 120 minutos da redução diária para compensar", () => {
    expect(concentrarBancoNoFinal(base([], "duas_horas"), 320)).toEqual(["2026-10-31"]);
  });
  it("feriado no domingo não inventa folga dominical confirmada", () => {
    expect(diagnosticarEscalaAviso(base(["2026-10-11"]), regra, [], []).apto).toBe(false);
  });
});