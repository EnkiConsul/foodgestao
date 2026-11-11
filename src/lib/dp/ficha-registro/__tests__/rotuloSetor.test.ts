import { describe, expect, it } from "vitest";
import { rotuloSetor } from "../organizacao-lote";

describe("rotuloSetor", () => {
  it("mostra setor salvo em caixa alta em caixa normal", () => {
    expect(rotuloSetor("COZINHA")).toBe("Cozinha");
    expect(rotuloSetor("SALÃO")).toBe("Salão");
  });
  it("mantém conectivos em minúsculas", () => {
    expect(rotuloSetor("LIMPEZA E HIGIENE")).toBe("Limpeza e Higiene");
  });
  it("não mexe em nomes já escritos pelo cliente", () => {
    expect(rotuloSetor("Atendimento")).toBe("Atendimento");
    expect(rotuloSetor("Sem setor")).toBe("Sem setor");
  });
});
