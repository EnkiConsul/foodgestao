import { describe, expect, it } from "vitest";
import { computeCoverage, tipoColetivoDoc, tiposEquivalentes } from "@/lib/dp/bulk-coverage";

const pessoa = (id: string, nome: string) => ({
  id,
  nome,
  unidade_id: "u1",
  ativo: true,
  data_admissao: "2026-01-05",
  data_desligamento: null,
  possui_folha_ponto: true,
  optante_adiantamento: true,
});

describe("cobertura do lote considerando documentos já salvos", () => {
  const colaboradores = [pessoa("a", "ANA"), pessoa("b", "BRUNO"), pessoa("c", "CARLA")];

  it("não acusa falta de quem já teve o documento importado antes", () => {
    const r = computeCoverage({
      colaboradores,
      vinculados: new Set(["c"]),
      jaImportados: new Set(["a", "b"]),
      competencia: "2026-08",
      unidadeIds: ["u1"],
      tipo: "ponto",
    });
    expect(r.esperados).toHaveLength(3);
    expect(r.faltantes).toHaveLength(0);
    expect(r.cobertos).toBe(3);
  });

  it("acusa falta apenas de quem não tem documento em lugar nenhum", () => {
    const r = computeCoverage({
      colaboradores,
      vinculados: new Set(["c"]),
      jaImportados: new Set(["a"]),
      competencia: "2026-08",
      unidadeIds: ["u1"],
      tipo: "contracheque",
    });
    expect(r.faltantes.map((c) => c.id)).toEqual(["b"]);
  });

  it("documento pontual nunca cobra os demais colaboradores", () => {
    const r = computeCoverage({
      colaboradores,
      vinculados: new Set(["c"]),
      competencia: "2026-08",
      unidadeIds: ["u1"],
      tipo: "outros",
    });
    expect(r.tipoColetivo).toBe(false);
    expect(r.faltantes).toHaveLength(0);
  });

  it("classifica tipos coletivos e equivalentes", () => {
    expect(tipoColetivoDoc("ponto")).toBe(true);
    expect(tipoColetivoDoc("pro_labore")).toBe(true);
    expect(tipoColetivoDoc("trct")).toBe(false);
    expect(tiposEquivalentes("rescisao")).toEqual(["trct", "demonstrativo_rescisorio"]);
    expect(tiposEquivalentes("ponto")).toEqual(["ponto"]);
  });
});
