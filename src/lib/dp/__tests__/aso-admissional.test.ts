import { describe, expect, it } from "vitest";
import { asoLiberaContabilidade, linkMapsValido, mensagemAgendamentoAso } from "../aso-admissional";

describe("exame admissional", () => {
  it("só agendado não libera a contabilidade", () => {
    expect(asoLiberaContabilidade({ modo: "agendado", clinica: "X", data: "2026-10-20" })).toBe(false);
  });
  it("ASO apto sem arquivo não libera", () => {
    expect(asoLiberaContabilidade({ modo: "realizado", parecer: "apto" })).toBe(false);
  });
  it("ASO apto com arquivo libera", () => {
    expect(asoLiberaContabilidade({ modo: "realizado", parecer: "apto", arquivo_path: "a.pdf" })).toBe(true);
  });
  it("dispensa exige justificativa de 15 caracteres", () => {
    expect(asoLiberaContabilidade({ modo: "dispensado", base_legal: "nr1_me_epp_gr12", justificativa: "curta" })).toBe(false);
    expect(asoLiberaContabilidade({ modo: "dispensado", base_legal: "nr1_me_epp_gr12", justificativa: "ME com grau de risco 1" })).toBe(true);
  });
  it("aceita só link do Google Maps", () => {
    expect(linkMapsValido("https://maps.app.goo.gl/abc")).toBe(true);
    expect(linkMapsValido("https://exemplo.com/mapa")).toBe(false);
  });
  it("mensagem leva o link do mapa", () => {
    const m = mensagemAgendamentoAso({ nome: "VERÔNICA SILVA", aso: { clinica: "CLÍNICA A", data: "2026-10-20", hora: "08:00", maps_url: "https://maps.app.goo.gl/x" } });
    expect(m).toContain("Olá, Verônica!");
    expect(m).toContain("20/10/2026 às 08:00");
    expect(m).toContain("https://maps.app.goo.gl/x");
  });
});
