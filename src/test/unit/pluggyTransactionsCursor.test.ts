import { describe, expect, it } from "vitest";
import {
  nextTransactionsPath,
  readNextPointer,
} from "../../../supabase/functions/_shared/pluggy-cursor";

describe("paginação do /v2/transactions", () => {
  it("aceita caminho completo devolvido pela API", () => {
    expect(nextTransactionsPath("/v2/transactions?accountId=1&pageCursor=abc")).toBe(
      "/v2/transactions?accountId=1&pageCursor=abc",
    );
  });

  it("aceita query string", () => {
    expect(nextTransactionsPath("?pageCursor=abc")).toBe("/v2/transactions?pageCursor=abc");
  });

  it("aceita URL absoluta", () => {
    expect(nextTransactionsPath("https://api.pluggy.ai/v2/transactions?pageCursor=abc")).toBe(
      "/v2/transactions?pageCursor=abc",
    );
  });

  it("aceita cursor puro", () => {
    expect(nextTransactionsPath("abc/def")).toBe(
      "/v2/transactions?pageCursor=abc%2Fdef",
    );
  });

  it("encerra quando não há ponteiro", () => {
    expect(nextTransactionsPath(null)).toBeNull();
    expect(nextTransactionsPath("")).toBeNull();
    expect(nextTransactionsPath("   ")).toBeNull();
  });

  it("lê ponteiro tanto em next quanto em nextCursor", () => {
    expect(readNextPointer({ next: "?pageCursor=a" })).toBe("/v2/transactions?pageCursor=a");
    expect(readNextPointer({ nextCursor: "b" })).toBe("/v2/transactions?pageCursor=b");
    expect(readNextPointer({ results: [] } as never)).toBeNull();
    expect(readNextPointer(null)).toBeNull();
  });

  it("percorre duas páginas seguindo o ponteiro", () => {
    const pages = [
      { results: [{ id: "1" }], next: "?pageCursor=p2" },
      { results: [{ id: "2" }], next: null },
    ];
    const visited: (string | null)[] = [];
    let path: string | null = "/v2/transactions?accountId=x";
    let i = 0;
    while (path && i < pages.length) {
      visited.push(path);
      path = readNextPointer(pages[i]);
      i++;
    }
    expect(visited).toEqual(["/v2/transactions?accountId=x", "/v2/transactions?pageCursor=p2"]);
    expect(path).toBeNull();
  });
});
