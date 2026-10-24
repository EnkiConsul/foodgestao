import { describe, expect, it } from "vitest";
import { concentrarNoFinal, saldoDesligamento, simularBancoSobreCalendario } from "../../BancoDesligamento";
import { simularDesligamento } from "@/lib/dp/compensacao/desligamentoMotor";

const base = () => {
  const r = simularDesligamento({ dataAdmissao: "2024-01-10", dataComunicacao: "2026-10-01", modalidade: "trabalhado", reducao: "duas_horas", jornadaSemanal: [0,480,480,480,480,480,240] });
  if ("erro" in r) throw new Error(r.erro);
  return r;
};
describe("Banco de desligamento compartilhado", () => {
  it("converte dois dias de oito horas em 960 minutos", () => {
    expect(saldoDesligamento("2", "dias", "8")).toEqual({ minutos: 960, erro: null });
  });
  it("dias não assumem equivalência ausente", () => {
    expect(saldoDesligamento("2", "dias", "").minutos).toBeNull();
  });
  it("14 horas concentram 3 jornadas e não mudam término nem prazo", () => {
    const b = base();
    const datas = concentrarNoFinal(b, 840);
    expect(datas).toEqual(["2026-10-29", "2026-10-30", "2026-10-31"]);
    const r = simularBancoSobreCalendario(b, 840, datas);
    expect(r.ultimoComparecimento).toBe("2026-10-28");
    expect(r.saldoResidualMinutos).toBe(0);
    expect(r.dataEfetiva).toBe("2026-10-31");
    expect(r.prazoQuitacao).toBe("2026-11-10");
  });
  it("folga de seis horas não é aprovada com saldo de uma hora", () => {
    expect(simularBancoSobreCalendario(base(),60,["2026-10-30"]).folgasRejeitadas).toEqual([{data:"2026-10-30",motivo:"excede_saldo"}]);
  });
});