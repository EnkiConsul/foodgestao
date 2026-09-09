import { describe, expect, it } from "vitest";
import { resolverDecisoesDup } from "../bulk-duplicate-decisoes";

describe("resolverDecisoesDup", () => {
  it("sem duplicados, tudo vai para aprovação normal", () => {
    const r = resolverDecisoesDup({ elegiveis: ["a", "b"], duplicados: [], decisoes: {} });
    expect(r).toEqual({ aprovar: ["a", "b"], substituir: [], ignorar: [], pendentes: [] });
  });

  it("respeita decisões de ignorar e substituir", () => {
    const r = resolverDecisoesDup({
      elegiveis: ["a", "b", "c"],
      duplicados: ["b", "c"],
      decisoes: { b: "skip", c: "replace" },
    });
    expect(r.aprovar).toEqual(["a"]);
    expect(r.ignorar).toEqual(["b"]);
    expect(r.substituir).toEqual(["c"]);
    expect(r.pendentes).toEqual([]);
  });

  it("colisão sem decisão fica pendente de confirmação", () => {
    const r = resolverDecisoesDup({
      elegiveis: ["a", "b"],
      duplicados: ["b"],
      decisoes: {},
    });
    expect(r.aprovar).toEqual(["a"]);
    expect(r.pendentes).toEqual(["b"]);
  });

  it("decisão de página que não colide é ignorada", () => {
    const r = resolverDecisoesDup({
      elegiveis: ["a"],
      duplicados: [],
      decisoes: { a: "skip" },
    });
    expect(r.aprovar).toEqual(["a"]);
    expect(r.ignorar).toEqual([]);
  });
});
