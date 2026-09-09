import { describe, it, expect } from "vitest";
import { toUpperCadastro } from "@/lib/text/upperCadastro";

describe("toUpperCadastro", () => {
  it("grava cadastros em caixa alta", () => {
    expect(toUpperCadastro("luiz guimarães das chagas")).toBe("LUIZ GUIMARÃES DAS CHAGAS");
    expect(toUpperCadastro("Auxiliar de Cozinha")).toBe("AUXILIAR DE COZINHA");
  });

  it("colapsa espaços e remove sobras", () => {
    expect(toUpperCadastro("  loja   garavelo ")).toBe("LOJA GARAVELO");
  });

  it("preserva vazios e nulos", () => {
    expect(toUpperCadastro("")).toBe("");
    expect(toUpperCadastro("   ")).toBe("");
    expect(toUpperCadastro(null)).toBeNull();
    expect(toUpperCadastro(undefined)).toBeUndefined();
  });
});
