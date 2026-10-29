import { describe, expect, it } from "vitest";
import { antecedentesElegiveis, antecedenteRecente, textoAntecedentes, type AntecedenteDisciplinar } from "../disciplinar-reincidencia";
const verbal: AntecedenteDisciplinar = { id: "v", colaborador_id: "c", tipo: "advertencia_verbal", data: "2026-09-10", motivo: "Atraso" };
const escrita = { ...verbal, id: "e", tipo: "advertencia_escrita", data: "2026-09-20", via_assinada_path: "assinada.pdf" };
describe("referências disciplinares opcionais", () => {
  it("inclui verbal e escrita assinada do contrato atual", () => {
    expect(antecedentesElegiveis([verbal, escrita], "c", "2026-01-01", "2026-10-29").map(r => r.id)).toEqual(["e", "v"]);
  });
  it("exclui contrato anterior na recontratação", () => {
    expect(antecedentesElegiveis([verbal, escrita], "c", "2026-09-15", "2026-10-29").map(r => r.id)).toEqual(["e"]);
  });
  it("não presume contrato sem admissão", () => expect(antecedentesElegiveis([verbal], "c", null, "2026-10-29")).toEqual([]));
  it("não cita minuta formal sem via assinada", () => expect(antecedentesElegiveis([{ ...escrita, via_assinada_path: null }], "c", "2026-01-01", "2026-10-29")).toEqual([]));
  it("exclui próprio registro, outro colaborador, excluído e mesma data", () => {
    const rows = [verbal, {...escrita, colaborador_id: "outro"}, {...verbal, id: "x", removido_em: "2026-10-01"}, {...verbal, id: "s", data: "2026-10-29"}];
    expect(antecedentesElegiveis(rows, "c", "2026-01-01", "2026-10-29", "v")).toEqual([]);
  });
  it("não inclui elogios", () => expect(antecedentesElegiveis([{...verbal,tipo:"elogio"}], "c", "2026-01-01", "2026-10-29")).toEqual([]));
  it("seleção vazia não gera citação", () => expect(textoAntecedentes([])).toBe(""));
  it("distingue verbal de escrita e mantém ordem cronológica", () => {
    const text = textoAntecedentes([escrita, verbal]);
    expect(text.indexOf("10/09/2026")).toBeLessThan(text.indexOf("20/09/2026"));
    expect(text).toContain("orientação e advertência verbal");
    expect(text).toContain("advertência escrita");
  });
  it("marca seis meses apenas pela data", () => {
    expect(antecedenteRecente("2026-04-29", "2026-10-29")).toBe(true);
    expect(antecedenteRecente("2026-04-28", "2026-10-29")).toBe(false);
  });
});