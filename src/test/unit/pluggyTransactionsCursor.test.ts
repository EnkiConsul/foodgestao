import { describe, it, expect } from "vitest";
import { nextTransactionsPath } from "../../../supabase/functions/_shared/pluggy.ts";

describe("nextTransactionsPath", () => {
  it("ignora ausência de próxima página", () => {
    expect(nextTransactionsPath(null)).toBeNull();
    expect(nextTransactionsPath(undefined)).toBeNull();
    expect(nextTransactionsPath("  ")).toBeNull();
  });

  it("usa o caminho devolvido pela API como está", () => {
    expect(nextTransactionsPath("/v2/transactions?pageCursor=abc")).toBe(
      "/v2/transactions?pageCursor=abc",
    );
  });

  it("completa quando vem só a query string", () => {
    expect(nextTransactionsPath("?pageCursor=abc")).toBe("/v2/transactions?pageCursor=abc");
  });

  it("extrai o caminho de uma URL absoluta", () => {
    expect(nextTransactionsPath("https://api.pluggy.ai/v2/transactions?pageCursor=abc")).toBe(
      "/v2/transactions?pageCursor=abc",
    );
  });

  it("trata cursor puro como pageCursor (nunca como after do caminho inteiro)", () => {
    const path = nextTransactionsPath("Y3Vyc29yOjEyMw==");
    expect(path).toBe("/v2/transactions?pageCursor=Y3Vyc29yOjEyMw%3D%3D");
    expect(path).not.toContain("after=");
  });
});
