import { describe, expect, it } from "vitest";

import {
  mergeTableLayoutExtras,
  removeTableLayoutExtras,
  sanitizeHidden,
  sanitizeOrder,
  sanitizeWidths,
  toggleHiddenKey,
} from "@/lib/table-layouts";

describe("table-layouts: sanitizeOrder", () => {
  const def = ["a", "b", "c"] as const;

  it("mantém ordem válida e anexa chaves faltantes", () => {
    expect(sanitizeOrder(["c", "a"], [...def])).toEqual(["c", "a", "b"]);
  });

  it("ignora chaves desconhecidas", () => {
    expect(sanitizeOrder(["x", "b", "a", "c"], [...def])).toEqual(["b", "a", "c"]);
  });

  it("valor inválido retorna o padrão", () => {
    expect(sanitizeOrder("nope", [...def])).toEqual([...def]);
    expect(sanitizeOrder([], [...def])).toEqual([...def]);
  });
});

describe("table-layouts: sanitizeWidths", () => {
  const def = { a: 100, b: 200 };

  it("mantém larguras válidas e ignora abaixo do mínimo", () => {
    expect(sanitizeWidths({ a: 150, b: 10 }, def, 80)).toEqual({ a: 150, b: 200 });
  });

  it("ignora chaves desconhecidas e valores não numéricos", () => {
    expect(sanitizeWidths({ a: "x", z: 500 }, def, 80)).toEqual({ a: 100, b: 200 });
  });
});

describe("table-layouts: sanitizeHidden", () => {
  const def = ["a", "b", "c"] as const;

  it("remove essenciais e chaves desconhecidas", () => {
    expect(sanitizeHidden(["a", "c", "z"], [...def], ["a"], [])).toEqual(["c"]);
  });

  it("valor inválido retorna o padrão de ocultas", () => {
    expect(sanitizeHidden(null, [...def], ["a"], ["b"])).toEqual(["b"]);
  });
});

describe("table-layouts: toggleHiddenKey", () => {
  const order = ["a", "b", "c"] as const;

  it("oculta e reexibe coluna normal", () => {
    expect(toggleHiddenKey([], [...order], "c", ["a"])).toEqual(["c"]);
    expect(toggleHiddenKey(["c"], [...order], "c", ["a"])).toEqual([]);
  });

  it("não oculta coluna essencial", () => {
    expect(toggleHiddenKey([], [...order], "a", ["a"])).toBeNull();
  });

  it("não oculta a última coluna visível", () => {
    expect(toggleHiddenKey(["b", "c"], [...order], "a", [])).toBeNull();
  });
});

describe("table-layouts: merge em extras", () => {
  it("preserva outras chaves de extras e layouts de outras telas", () => {
    const extras = {
      favoritos: ["x"],
      table_layouts: {
        dp_colaboradores: { order: ["nome"] },
      },
    };
    const merged = mergeTableLayoutExtras(extras as any, "dp_historico_documentos", { hidden: ["tipo"] });
    expect((merged as any).favoritos).toEqual(["x"]);
    expect((merged as any).table_layouts.dp_colaboradores).toEqual({ order: ["nome"] });
    expect((merged as any).table_layouts.dp_historico_documentos).toEqual({ hidden: ["tipo"] });
  });

  it("não muta o objeto original", () => {
    const extras = { table_layouts: { a: 1 } } as any;
    mergeTableLayoutExtras(extras, "b", 2);
    expect(extras.table_layouts.b).toBeUndefined();
  });

  it("removeTableLayoutExtras remove só a tela informada", () => {
    const extras = { favoritos: ["x"], table_layouts: { a: 1, b: 2 } } as any;
    const r = removeTableLayoutExtras(extras, "a");
    expect((r as any).table_layouts).toEqual({ b: 2 });
    expect((r as any).favoritos).toEqual(["x"]);
    expect(extras.table_layouts.a).toBe(1); // original intacto
  });
});
