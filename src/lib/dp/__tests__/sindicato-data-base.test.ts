import { describe, expect, it } from "vitest";
import { dataBaseIso, mascaraDataBase } from "../sindicato-data-base";

describe("data-base do sindicato", () => {
  it("guarda dia/mês com o ano fixo 2000", () => {
    expect(dataBaseIso("01/05")).toBe("2000-05-01");
  });
  it("recusa dia que não existe no mês", () => {
    expect(dataBaseIso("31/04")).toBeNull();
    expect(dataBaseIso("30/02")).toBeNull();
  });
  it("aceita 29/02", () => {
    expect(dataBaseIso("29/02")).toBe("2000-02-29");
  });
  it("recusa mês inválido ou formato errado", () => {
    expect(dataBaseIso("10/13")).toBeNull();
    expect(dataBaseIso("1/5")).toBeNull();
  });
  it("máscara insere a barra", () => {
    expect(mascaraDataBase("0105")).toBe("01/05");
    expect(mascaraDataBase("01")).toBe("01");
  });
});
