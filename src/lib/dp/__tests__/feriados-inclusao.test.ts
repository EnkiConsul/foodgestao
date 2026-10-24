import { describe, expect, it } from "vitest";
import { feriadosParaInclusao } from "@/hooks/useDpFeriados";
import { dataDoFeriadoNoAno, type FeriadoRegra } from "../feriados";

describe("inclusão de nacionais e opção local", () => {
  it("inclui apenas nove datas fixas sem confirmação local", () => {
    const novos = feriadosParaInclusao([]);
    expect(novos).toHaveLength(9);
    expect(novos.every((f) => f.tipo === "anual")).toBe(true);
  });
  it("inclui Sexta-feira Santa móvel somente quando selecionada", () => {
    const novos = feriadosParaInclusao([], true);
    expect(novos).toHaveLength(10);
    const sexta = novos.find((f) => f.codigo_movel === "sexta_feira_santa");
    expect(sexta).toBeDefined();
    if (!sexta) throw new Error("Feriado ausente");
    expect(dataDoFeriadoNoAno({ ...sexta, id: "sexta" }, 2026)).toBe("2026-04-03");
    expect(dataDoFeriadoNoAno({ ...sexta, id: "sexta" }, 2027)).toBe("2027-03-26");
  });
  it("não duplica regras existentes nem reativa as desligadas", () => {
    const atuais = feriadosParaInclusao([], true).map((f, i) => ({ ...f, id: String(i), ativo: false })) as FeriadoRegra[];
    expect(feriadosParaInclusao(atuais, true)).toEqual([]);
  });
  it("não inclui Carnaval ou Corpus Christi junto com nacionais", () => {
    expect(feriadosParaInclusao([], true).filter((f) => f.tipo === "movel").map((f) => f.codigo_movel))
      .toEqual(["sexta_feira_santa"]);
  });
});