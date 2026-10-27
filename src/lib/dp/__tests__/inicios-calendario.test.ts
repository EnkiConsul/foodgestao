import { describe, expect, it } from "vitest";
import { montarIniciosCalendario } from "../inicios-calendario";

describe("inícios do calendário", () => {
  const c = { id: "c1", nome: "Pessoa teste", unidade_id: "u1", regime: "clt", data_admissao: "2026-10-12" };
  it("exibe admissão sem exigir um ano", () => {
    expect(montarIniciosCalendario([c], [], "2026-10")).toMatchObject([{ data: "2026-10-12", tipo: "formal" }]);
  });
  it("separa início provisório de admissão prevista sem duplicar rotina", () => {
    const p = { id: "p1", candidato_nome: "Pessoa teste", status: "aguardando_revisao", colaborador_id: null, unidade_prevista_id: "u1", admin_dados: { rotina: { colaborador_id: "c1", iniciou_em: "2026-10-12" }, data_admissao: "2026-10-30" } };
    expect(montarIniciosCalendario([{ ...c, origem_cadastro: "preadmissao_rotina", regime: "freelancer" }], [p], "2026-10").map((e) => [e.data, e.tipo])).toEqual([["2026-10-12", "provisorio"], ["2026-10-30", "prevista"]]);
  });
  it("usa data formal após conversão sem misturar períodos", () => {
    expect(montarIniciosCalendario([{ ...c, data_base_contagem: "2026-11-03" }], [], "2026-11")).toMatchObject([{ data: "2026-11-03", tipo: "formal" }]);
  });
  it("após efetivar a pré-admissão, mostra só a admissão oficial do mesmo registro", () => {
    const p = { id: "p1", candidato_nome: "Pessoa teste", status: "concluido", colaborador_id: "c1", unidade_prevista_id: "u1", admin_dados: { rotina: { colaborador_id: "c1", iniciou_em: "2026-10-12" }, data_admissao: "2026-10-30" } };
    expect(montarIniciosCalendario([{ ...c, origem_cadastro: "preadmissao_rotina", regime: "freelancer", data_admissao: "2026-10-30" }], [p], "2026-10").map((e) => [e.data, e.tipo])).toEqual([["2026-10-30", "formal"]]);
  });
  it("não exibe previsão cancelada", () => {
    expect(montarIniciosCalendario([], [{ id: "p1", candidato_nome: "Pessoa teste", status: "cancelado", colaborador_id: null, unidade_prevista_id: "u1", admin_dados: { data_admissao: "2026-10-30" } }], "2026-10")).toEqual([]);
  });
  it("mantém início histórico do desligado", () => {
    expect(montarIniciosCalendario([{ ...c, data_desligamento: "2026-11-06" }], [], "2026-10")).toHaveLength(1);
  });
});