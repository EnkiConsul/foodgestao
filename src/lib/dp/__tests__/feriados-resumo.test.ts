import { describe, expect, it } from "vitest";
import { resumoFeriados } from "../feriados-apresentacao";
import type { FeriadoRegra } from "../feriados";

const regras: FeriadoRegra[] = [
  { id: "1", nome: "Natal", tipo: "anual", dia: 25, mes: 12 },
  { id: "2", nome: "Inativo", tipo: "anual", dia: 1, mes: 1, ativo: false },
  { id: "3", nome: "Outro ano", tipo: "especifica", data: "2027-03-01", ativo: true },
  { id: "4", nome: "Paixão", tipo: "movel", codigo_movel: "sexta_feira_santa", ativo: true },
];

describe("resumo de feriados da unidade", () => {
  it("conta todas as regras cadastradas, inclusive desligadas", () => {
    expect(resumoFeriados(regras, 2026).cadastrados).toBe(4);
  });
  it("conta ativos independentemente de ocorrerem no ano selecionado", () => {
    expect(resumoFeriados(regras, 2026).ativos).toBe(3);
  });
  it("conta somente ocorrências ativas do ano, incluindo móveis", () => {
    expect(resumoFeriados(regras, 2026).noAno).toBe(2);
    expect(resumoFeriados(regras, 2027).noAno).toBe(3);
  });
});