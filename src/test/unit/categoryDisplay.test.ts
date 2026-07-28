import { describe, expect, it } from "vitest";
import {
  CATEGORY_INDENT_STEP,
  CATEGORY_SUBTYPE_CLS,
  CATEGORY_SUBTYPE_LABEL,
  CATEGORY_TYPE_LABEL,
  categoryGuideLevels,
  categoryIndent,
  categoryTypeClass,
  categoryTypeLabel,
} from "@/lib/categories/display";

describe("categoryIndent", () => {
  it("não indenta a raiz", () => {
    expect(categoryIndent(0)).toBe(0);
  });

  it("indenta em passos constantes por nível", () => {
    for (let depth = 0; depth <= 6; depth++) {
      expect(categoryIndent(depth)).toBe(depth * CATEGORY_INDENT_STEP);
    }
  });

  it("mantém o passo constante entre níveis consecutivos", () => {
    for (let depth = 1; depth <= 6; depth++) {
      expect(categoryIndent(depth) - categoryIndent(depth - 1)).toBe(CATEGORY_INDENT_STEP);
    }
  });

  it("soma a base informada sem alterar o passo", () => {
    expect(categoryIndent(0, 12)).toBe(12);
    expect(categoryIndent(3, 12)).toBe(12 + 3 * CATEGORY_INDENT_STEP);
  });

  it("trata profundidade negativa como raiz", () => {
    expect(categoryIndent(-2)).toBe(0);
    expect(categoryIndent(-2, 12)).toBe(12);
  });
});

describe("categoryTypeLabel / categoryTypeClass", () => {
  it("retorna os rótulos Receita e Despesa", () => {
    expect(categoryTypeLabel("receita")).toBe("Receita");
    expect(categoryTypeLabel("despesa")).toBe("Despesa");
  });

  it("usa Receita como fallback para tipos desconhecidos", () => {
    expect(categoryTypeLabel("outro")).toBe(CATEGORY_TYPE_LABEL.receita);
    expect(categoryTypeClass("outro")).toBe(categoryTypeClass("receita"));
  });

  it("diferencia visualmente receita de despesa", () => {
    expect(categoryTypeClass("receita")).not.toBe(categoryTypeClass("despesa"));
    expect(categoryTypeClass("receita")).toContain("emerald");
    expect(categoryTypeClass("despesa")).toContain("red");
  });

  it("não expõe numeração posicional nos rótulos", () => {
    Object.values(CATEGORY_TYPE_LABEL).forEach((label) => {
      expect(label).not.toMatch(/\d/);
    });
  });
});

describe("subtipos de categoria", () => {
  it("tem classe para cada rótulo de subtipo", () => {
    Object.keys(CATEGORY_SUBTYPE_LABEL).forEach((key) => {
      expect(CATEGORY_SUBTYPE_CLS[key]).toBeTruthy();
    });
  });
});

describe("categoryGuideLevels", () => {
  it("não desenha guias no nível raiz", () => {
    expect(categoryGuideLevels(0)).toEqual([]);
  });
  it("desenha uma guia por ancestral", () => {
    expect(categoryGuideLevels(1)).toEqual([0]);
    expect(categoryGuideLevels(3)).toEqual([0, 1, 2]);
  });
  it("trata valores inválidos como raiz", () => {
    expect(categoryGuideLevels(-2)).toEqual([]);
    expect(categoryGuideLevels(NaN as unknown as number)).toEqual([]);
  });
});
