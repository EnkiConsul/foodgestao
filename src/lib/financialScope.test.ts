import { describe, it, expect, vi } from "vitest";
import {
  assertFinancialScope,
  applyFinancialScope,
  FinancialScopeError,
  isFinancialScopeReady,
} from "./financialScope";

function makeQuery() {
  const calls: Array<[string, string, unknown]> = [];
  const q: any = {
    eq: vi.fn((col: string, value: unknown) => {
      calls.push(["eq", col, value]);
      return q;
    }),
    is: vi.fn((col: string, value: unknown) => {
      calls.push(["is", col, value]);
      return q;
    }),
    _calls: calls,
  };
  return q;
}

describe("assertFinancialScope", () => {
  it("PF preserva userId e força companyId null", () => {
    const s = assertFinancialScope({ context: "pf", userId: "u1", companyId: "ignored" as any });
    expect(s).toEqual({ context: "pf", userId: "u1", companyId: null });
  });

  it("PJ exige companyId", () => {
    expect(() => assertFinancialScope({ context: "pj", userId: "u1", companyId: null }))
      .toThrow(FinancialScopeError);
    expect(() => assertFinancialScope({ context: "pj", userId: "u1" }))
      .toThrow(FinancialScopeError);
  });

  it("exige usuário autenticado", () => {
    expect(() => assertFinancialScope({ context: "pf", userId: null }))
      .toThrow(FinancialScopeError);
  });

  it("PJ retorna companyId concreto", () => {
    const s = assertFinancialScope({ context: "pj", userId: "u1", companyId: "c1" });
    expect(s).toEqual({ context: "pj", userId: "u1", companyId: "c1" });
  });
});

describe("applyFinancialScope", () => {
  it("PF filtra por user_id + company_id NULL", () => {
    const q = makeQuery();
    applyFinancialScope(q, { context: "pf", userId: "u1", companyId: null });
    expect(q._calls).toEqual([
      ["eq", "context", "pf"],
      ["eq", "user_id", "u1"],
      ["is", "company_id", null],
    ]);
  });

  it("PJ filtra somente por company_id (nunca por user_id)", () => {
    const q = makeQuery();
    applyFinancialScope(q, { context: "pj", userId: "u1", companyId: "c1" });
    expect(q._calls).toEqual([
      ["eq", "context", "pj"],
      ["eq", "company_id", "c1"],
    ]);
    expect(q._calls.some(([, col]) => col === "user_id")).toBe(false);
  });
});

describe("isFinancialScopeReady", () => {
  it("PF pronto com usuário", () => {
    expect(isFinancialScopeReady("pf", "u1", null)).toBe(true);
  });
  it("PJ requer companyId", () => {
    expect(isFinancialScopeReady("pj", "u1", null)).toBe(false);
    expect(isFinancialScopeReady("pj", "u1", "c1")).toBe(true);
  });
  it("sem usuário nunca pronto", () => {
    expect(isFinancialScopeReady("pf", null, null)).toBe(false);
  });
});
