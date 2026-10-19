import { describe, expect, it } from "vitest";
import { calendarioResumoNavigation as navegar, type CalendarioResumoNavigation } from "./calendarioResumoNavigation";
const state: CalendarioResumoNavigation = { aba: "hoje", competencia: "2026-10", selecionado: "2026-10-18" };
describe("navegação do calendário do início", () => {
  it("avança e volta um dia na aba Hoje", () => {
    expect(navegar(state, { type: "avancar", delta: 1 }).selecionado).toBe("2026-10-19");
    expect(navegar(state, { type: "avancar", delta: -1 }).selecionado).toBe("2026-10-17");
  });
  it("sincroniza o mês ao cruzar o ano por dia", () => {
    expect(navegar({ ...state, competencia: "2026-12", selecionado: "2026-12-31" }, { type: "avancar", delta: 1 }))
      .toEqual({ aba: "hoje", competencia: "2027-01", selecionado: "2027-01-01" });
  });
  it("avança e volta um mês sem selecionar automaticamente o dia 01", () => {
    const mes = { ...state, aba: "mes" as const };
    expect(navegar(mes, { type: "avancar", delta: 1 })).toEqual({ ...mes, competencia: "2026-11" });
    expect(navegar(mes, { type: "avancar", delta: -1 })).toEqual({ ...mes, competencia: "2026-09" });
  });
  it("mantém o dia escolhido ao alternar abas", () => {
    expect(navegar({ aba: "mes", competencia: "2026-11", selecionado: "2026-10-18" }, { type: "aba", aba: "hoje" })).toEqual(state);
  });
  it("seleciona explicitamente o dia tocado", () => {
    expect(navegar({ ...state, aba: "mes" }, { type: "selecionar", data: "2026-11-24" })).toEqual({ aba: "mes", competencia: "2026-11", selecionado: "2026-11-24" });
  });
  it("volta ao dia atual sem sair da aba Mês", () => {
    expect(navegar({ aba: "mes", competencia: "2027-01", selecionado: "2027-01-12" }, { type: "hoje", data: "2026-10-18" })).toEqual({ ...state, aba: "mes" });
  });
});
