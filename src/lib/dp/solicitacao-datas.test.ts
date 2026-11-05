import { describe, expect, it } from "vitest";
import { datasSolicitacao, solicitacaoAusentaNoDia, solicitacaoNoPeriodo } from "./solicitacao-datas";

const troca = { tipo: "folga", status: "pendente", data_alvo: "2026-10-30", data_fim: "2026-11-05" };
describe("troca é pontual e depende de aprovação", () => {
  it("pedido pendente não ausenta em 30/10 ou 02/11", () => {
    expect(solicitacaoAusentaNoDia(troca, "2026-10-30")).toBe(false);
    expect(solicitacaoAusentaNoDia(troca, "2026-11-02")).toBe(false);
  });
  it("aprovada ausenta só na folga desejada e não no intervalo nem na atual", () => {
    const aprovada = { ...troca, status: "aprovada" };
    expect(solicitacaoAusentaNoDia(aprovada, "2026-10-30")).toBe(true);
    expect(solicitacaoAusentaNoDia(aprovada, "2026-11-02")).toBe(false);
    expect(solicitacaoAusentaNoDia(aprovada, "2026-11-05")).toBe(false);
  });
  it("cancelada não ausenta", () => expect(solicitacaoAusentaNoDia({ ...troca, status: "cancelada" }, "2026-10-30")).toBe(false));
  it("atestado aprovado mantém intervalo inclusivo", () => expect(solicitacaoAusentaNoDia({ ...troca, tipo: "atestado", status: "aprovada" }, "2026-11-02")).toBe(true));
  it("adiantamento e outros genéricos não são afastamentos", () => {
    for (const tipo of ["adiantamento", "outros", "documento"]) expect(solicitacaoAusentaNoDia({ ...troca, tipo, status: "aprovada" }, "2026-11-02")).toBe(false);
  });
  it("preserva o sentido das duas datas legadas", () => expect(datasSolicitacao(troca).map(d => d.data)).toEqual(["2026-11-05", "2026-10-30"]));
  it("lista troca tanto no mês atual quanto desejado, não em mês intermediário", () => {
    expect(solicitacaoNoPeriodo(troca, "2026-11-01", "2026-11-30")).toBe(true);
    expect(solicitacaoNoPeriodo(troca, "2026-10-01", "2026-10-31")).toBe(true);
    expect(solicitacaoNoPeriodo({ ...troca, data_fim: "2026-12-05" }, "2026-11-01", "2026-11-30")).toBe(false);
  });
});