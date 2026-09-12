import { describe, expect, it } from "vitest";
import { distribuirLinhas } from "../menuGridRows";

describe("distribuirLinhas", () => {
  it("equilibra 8 itens em 5 colunas como 4+4", () => {
    expect(distribuirLinhas(8, 5)).toEqual([4, 4]);
  });

  it("equilibra 7 itens em 5 colunas como 4+3", () => {
    expect(distribuirLinhas(7, 5)).toEqual([4, 3]);
  });

  it("linha completa quando total é múltiplo", () => {
    expect(distribuirLinhas(5, 5)).toEqual([5]);
    expect(distribuirLinhas(10, 5)).toEqual([5, 5]);
  });

  it("equilibra 8 itens em 3 colunas como 3+3+2", () => {
    expect(distribuirLinhas(8, 3)).toEqual([3, 3, 2]);
  });

  it("menos itens que colunas forma uma linha só", () => {
    expect(distribuirLinhas(3, 5)).toEqual([3]);
  });

  it("casos vazios", () => {
    expect(distribuirLinhas(0, 5)).toEqual([]);
    expect(distribuirLinhas(5, 0)).toEqual([]);
  });
});
