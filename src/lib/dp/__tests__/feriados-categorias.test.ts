import { describe, expect, it } from "vitest";
import { categoriaFeriado, ehFeriadoLocal, feriadosDoAno, type FeriadoCategoria } from "../feriados";
import { agruparFeriadosDia, resumoFeriados } from "../feriados-apresentacao";
import { feriadosParaInclusao } from "@/hooks/useDpFeriados";

describe("categorias independentes da data", () => {
  it("inclui nove nacionais e Paixão municipal somente com seleção", () => {
    const itens = feriadosParaInclusao([], true);
    expect(itens.filter((f) => f.categoria === "nacional")).toHaveLength(9);
    expect(itens.find((f) => f.codigo_movel === "sexta_feira_santa")?.categoria).toBe("municipal");
  });
  it.each(["nacional", "estadual", "municipal", "sindicato"] as FeriadoCategoria[])("preserva categoria %s independente da data", (categoria) => {
    const regra = { id: "1", nome: "Data", tipo: "anual" as const, dia: 25, mes: 12, categoria };
    expect(categoriaFeriado(regra)).toBe(categoria);
    expect(ehFeriadoLocal(regra)).toBe(categoria !== "nacional");
    expect(feriadosDoAno([regra], 2026)[0].categoria).toBe(categoria);
    expect(resumoFeriados([regra], 2026).categorias[categoria]).toBe(1);
  });
  it("mantém dois feriados diferentes no mesmo dia", () => {
    const linhas = [
      { data: "2026-12-25", nome: "Natal", categoria: "nacional" as const, unidade_id: "1" },
      { data: "2026-12-25", nome: "Convenção", categoria: "sindicato" as const, unidade_id: "1" },
    ];
    expect(agruparFeriadosDia(linhas, "1", ["1"]).get("2026-12-25")).toHaveLength(2);
    expect(agruparFeriadosDia(linhas, null, ["1", "2"]).has("2026-12-25")).toBe(false);
  });
});