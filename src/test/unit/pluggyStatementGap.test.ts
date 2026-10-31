import { describe, it, expect } from "vitest";
import {
  isPendingTx, gapAfterTolerance, nextGapChecks, shouldSuggestReconnect, gapMessage,
} from "../../../supabase/functions/_shared/pluggy-statement-gap";

describe("conferência de extrato Pluggy", () => {
  it("PENDING é ignorado, POSTED não", () => {
    expect(isPendingTx({ status: "PENDING" })).toBe(true);
    expect(isPendingTx({ status: "POSTED" })).toBe(false);
    expect(isPendingTx({})).toBe(false);
  });
  it("diferença de R$ 0,41 não gera lacuna; R$ 1,00 gera", () => {
    expect(gapAfterTolerance(0.41)).toBeNull();
    expect(gapAfterTolerance(-0.99)).toBeNull();
    expect(gapAfterTolerance(1)).toBe(1);
    expect(gapAfterTolerance(-239.6)).toBe(-239.6);
  });
  it("contador sobe com lacuna e zera quando some", () => {
    expect(nextGapChecks(0, true)).toBe(1);
    expect(nextGapChecks(2, true)).toBe(3);
    expect(nextGapChecks(5, false)).toBe(0);
  });
  it("reconectar só após 3 detecções", () => {
    expect(shouldSuggestReconnect(2)).toBe(false);
    expect(shouldSuggestReconnect(3)).toBe(true);
    expect(gapMessage("C6", -10, "2026-10-01", "2026-10-02", 1)).toContain("Sincronizar novamente");
    expect(gapMessage("C6", -10, "2026-10-01", "2026-10-02", 3)).toContain("reconecte");
  });
});
