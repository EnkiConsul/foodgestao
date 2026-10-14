import { describe, it, expect } from "vitest";
import { unidadesDosColaboradores, colaboradoresDaUnidade } from "../compensacao/filtroCalculadora";

const colabs = [
  { id: "1", nome: "CRISTIANE", ativo: true, unidade_id: "u1", unidade_nome: "CENTRO" },
  { id: "2", nome: "ANA", ativo: true, unidade_id: "u2", unidade_nome: "CENTRO" },
  { id: "3", nome: "BRUNO", ativo: false, unidade_id: "u3", unidade_nome: "SUL" },
];

describe("Calculadora — filtro de unidade", () => {
  it("unidades com o mesmo nome não se misturam", () => {
    expect(unidadesDosColaboradores(colabs).map((u) => u.id)).toEqual(["u1", "u2"]);
    expect(colaboradoresDaUnidade(colabs, "u1").map((c) => c.id)).toEqual(["1"]);
  });
  it("unidade só com inativos fica sem colaboradores", () => {
    expect(colaboradoresDaUnidade(colabs, "u3")).toEqual([]);
  });
  it("todas lista só ativos em ordem alfabética", () => {
    expect(colaboradoresDaUnidade(colabs, "todas").map((c) => c.nome)).toEqual(["ANA", "CRISTIANE"]);
  });
});
