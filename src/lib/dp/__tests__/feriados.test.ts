import { describe, expect, it } from "vitest";
import {
  dataDoFeriadoNoAno,
  descricaoRegra,
  feriadosDoAno,
  type FeriadoRegra,
} from "@/lib/dp/feriados";

const regra = (p: Partial<FeriadoRegra>): FeriadoRegra => ({
  id: p.id ?? "r1",
  nome: p.nome ?? "Feriado",
  tipo: p.tipo ?? "anual",
  ...p,
});

describe("dataDoFeriadoNoAno", () => {
  it("data específica só vale no próprio ano", () => {
    const r = regra({ tipo: "especifica", data: "2027-11-20" });
    expect(dataDoFeriadoNoAno(r, 2027)).toBe("2027-11-20");
    expect(dataDoFeriadoNoAno(r, 2028)).toBeNull();
  });

  it("data fixa anual repete todo ano", () => {
    const r = regra({ tipo: "anual", dia: 25, mes: 12 });
    expect(dataDoFeriadoNoAno(r, 2027)).toBe("2027-12-25");
    expect(dataDoFeriadoNoAno(r, 2028)).toBe("2028-12-25");
  });

  it("29 de fevereiro só em ano bissexto", () => {
    const r = regra({ tipo: "anual", dia: 29, mes: 2 });
    expect(dataDoFeriadoNoAno(r, 2028)).toBe("2028-02-29");
    expect(dataDoFeriadoNoAno(r, 2027)).toBeNull();
  });

  it("primeiro domingo de outubro de 2027 é 03/10", () => {
    const r = regra({ tipo: "relativa", ordinal: 1, dia_semana: 0, mes: 10 });
    expect(dataDoFeriadoNoAno(r, 2027)).toBe("2027-10-03");
  });

  it("último domingo de outubro de 2027 é 31/10", () => {
    const r = regra({ tipo: "relativa", ordinal: -1, dia_semana: 0, mes: 10 });
    expect(dataDoFeriadoNoAno(r, 2027)).toBe("2027-10-31");
  });

  it("quinta ocorrência inexistente retorna nulo", () => {
    const r = regra({ tipo: "relativa", ordinal: 5, dia_semana: 0, mes: 10 });
    expect(dataDoFeriadoNoAno(r, 2026)).toBeNull();
  });
});

describe("feriadosDoAno", () => {
  it("ignora inativos e ordena por data", () => {
    const lista = feriadosDoAno(
      [
        regra({ id: "a", nome: "Natal", tipo: "anual", dia: 25, mes: 12 }),
        regra({ id: "b", nome: "Trabalho", tipo: "anual", dia: 1, mes: 5 }),
        regra({ id: "c", nome: "Desligado", tipo: "anual", dia: 2, mes: 1, ativo: false }),
      ],
      2027,
    );
    expect(lista.map((f) => f.data)).toEqual(["2027-05-01", "2027-12-25"]);
  });
});

describe("descricaoRegra", () => {
  it("explica cada tipo em linguagem simples", () => {
    expect(descricaoRegra(regra({ tipo: "especifica", data: "2027-11-20" }))).toBe(
      "Somente em 20/11/2027",
    );
    expect(descricaoRegra(regra({ tipo: "anual", dia: 25, mes: 12 }))).toBe(
      "Todo ano em 25 de dezembro",
    );
    expect(
      descricaoRegra(regra({ tipo: "relativa", ordinal: 1, dia_semana: 0, mes: 10 })),
    ).toBe("Todo ano no primeiro domingo de outubro");
  });
});
