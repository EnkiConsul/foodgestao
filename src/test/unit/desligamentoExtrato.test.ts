import { expect, it } from "vitest";
import { simularDesligamento } from "../../../supabase/functions/_shared/desligamento-motor";
import { extratoAviso } from "../../../supabase/functions/_shared/desligamento-extrato";
import { diretrizPonto, tratativaPendente } from "../../lib/dp/ocorrencias";
it("sete dias corridos geram seis abonos sem o DSR de 03/11 e sem saldo residual", () => {
  const r = simularDesligamento({ dataAdmissao: "2026-01-01", dataComunicacao: "2026-10-07", motivo: "dispensa_sem_justa_causa", modalidade: "trabalhado", reducao: "sete_dias", jornadaSemanal: [420,420,0,420,420,420,420] });
  if ("erro" in r) throw new Error(r.erro);
  const e = extratoAviso(r);
  expect(e.dias_art488).toEqual(["2026-10-31","2026-11-01","2026-11-02","2026-11-04","2026-11-05","2026-11-06"]);
  expect(e.periodo_reducao).toEqual({ inicio: "2026-10-31", fim: "2026-11-06" });
  expect(e).not.toHaveProperty("saldoResidualMinutos"); expect(r.prazoQuitacao).toBe("2026-11-16");
});
it("dispensa do Art. 488 é evento definido: abono sem pendência de tratativa", () => {
  const o = { tipo:"ausencia_justificada",estado:"confirmada",origem:"sistema",analise_status:"analisada",impacta_assiduidade:"nao",tratativa_ponto:true,tratativa_status:"pendente",subtipo:"dispensa_aviso_art488" };
  expect(tratativaPendente(o)).toBe(false); expect(diretrizPonto(o)).toBe("abonar");
});
it("feriado sem expediente de 02/11 não duplica os sete dias nem gera abono", () => {
  const r = simularDesligamento({ dataAdmissao: "2026-01-01", dataComunicacao: "2026-10-07", motivo: "dispensa_sem_justa_causa", modalidade: "trabalhado", reducao: "sete_dias", jornadaSemanal: [420,420,0,420,420,420,420], feriados:["2026-11-02"] });
  if ("erro" in r) throw new Error(r.erro);
  expect(extratoAviso(r).dias_art488).toEqual(["2026-10-31","2026-11-01","2026-11-04","2026-11-05","2026-11-06"]);
  expect(extratoAviso(r).dias_sem_expediente).toContain("2026-11-02");
});