import { describe, expect, it } from "vitest";
import { validarAdminDados } from "../../../supabase/functions/_shared/preadmissao";
import { passoAdmissao, pontoNaAdmissao } from "../../lib/dp/admissao-apresentacao";
describe("Admissão: ponto e progresso oficial", () => {
  it("preserva a folha de ponto marcada como booleano", () => {
    const r = validarAdminDados({ possui_folha_ponto: true, folha_ponto_dispensa_justificativa: "" });
    expect(r.erros).toEqual({}); expect(r.fora).toEqual([]); expect(r.campos.possui_folha_ponto).toBe(true);
    expect(pontoNaAdmissao(true, "", true, true)).toBe(true);
  });
  it("preserva decisão explícita e herda unidade apenas quando não há decisão", () => {
    expect(pontoNaAdmissao(false, "Dispensa fundamentada", true, true)).toBe(false);
    expect(pontoNaAdmissao(undefined, "", true, true)).toBe(true);
    expect(pontoNaAdmissao(undefined, "", false, true)).toBe(false);
  });
  it("salvar ficha em revisão não conclui a etapa", () => {
    expect(passoAdmissao("aguardando_revisao", true, false)).toBe(0);
    expect(passoAdmissao("pronto_contabilidade", true, false)).toBe(1);
    expect(passoAdmissao("pronto_contabilidade", true, true)).toBe(2);
    expect(passoAdmissao("registro_recebido", true, true)).toBe(3);
  });
  it("dispensa de ponto exige justificativa com dez caracteres", () => {
    expect(validarAdminDados({ folha_ponto_dispensa_justificativa: "curta" }).erros.folha_ponto_dispensa_justificativa).toBeTruthy();
    expect(validarAdminDados({ folha_ponto_dispensa_justificativa: "Dispensa formal" }).erros).toEqual({});
  });
});