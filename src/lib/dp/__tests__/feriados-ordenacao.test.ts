import { describe, expect, it } from "vitest";
import { ordenarFeriadosCadastro } from "../feriados-ordenacao";
import type { FeriadoRegra } from "../feriados";

describe("ordenação do cadastro de feriados", () => {
  it("ordena pela data, não pelo nome, mantendo inativos", () => {
    const regras: FeriadoRegra[] = [
      { id: "natal", nome: "A Natal", tipo: "anual", mes: 12, dia: 25 },
      { id: "janeiro", nome: "Z Janeiro", tipo: "anual", mes: 1, dia: 1, ativo: false },
    ];
    expect(ordenarFeriadosCadastro(regras, 2026).map(r => r.id)).toEqual(["janeiro", "natal"]);
    expect(regras[0].id).toBe("natal");
  });
  it("resolve datas relativas no ano selecionado antes de ordenar", () => {
    expect(ordenarFeriadosCadastro([
      { id: "fixo", nome: "A", tipo: "anual", mes: 10, dia: 4 },
      { id: "relativo", nome: "Z", tipo: "relativa", mes: 10, ordinal: 1, dia_semana: 0 },
    ], 2027).map(r => r.id)).toEqual(["relativo", "fixo"]);
  });
  it("preserva regras sem ocorrência no ano após as datas aplicáveis", () => {
    expect(ordenarFeriadosCadastro([
      { id: "antigo", nome: "A", tipo: "especifica", data: "2024-01-01" },
      { id: "futuro", nome: "B", tipo: "anual", mes: 1, dia: 1, ano_inicio: 2028 },
      { id: "atual", nome: "Z", tipo: "anual", mes: 12, dia: 25 },
    ], 2026).map(r => r.id)).toEqual(["atual", "antigo", "futuro"]);
  });
});