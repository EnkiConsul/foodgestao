import { describe, it, expect } from "vitest";
import {
  isPendingTx, gapAfterTolerance, nextGapChecks, shouldSuggestReconnect,
  gapPersistHours, nextGapFirstSeenAt, shouldShowGap, countsInStatement,
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
  const firstSeen = "2026-10-29T19:00:00Z";
  it("3 ou mais detecções antes de 48h não sugerem reconexão", () => {
    expect(shouldSuggestReconnect(3, firstSeen, new Date("2026-10-31T18:59:59Z"))).toBe(false);
    expect(shouldSuggestReconnect(100, firstSeen, new Date("2026-10-29T22:00:00Z"))).toBe(false);
  });
  it("48h ou mais E 3 detecções permitem sugestão", () => {
    expect(shouldSuggestReconnect(3, firstSeen, new Date("2026-10-31T19:00:00Z"))).toBe(true);
    expect(shouldSuggestReconnect(2, firstSeen, new Date("2026-11-01T19:00:00Z"))).toBe(false);
  });
  it("prazo configurável padrão 48h e mínimo 24h", () => {
    expect(gapPersistHours()).toBe(48);
    expect(gapPersistHours("invalid")).toBe(48);
    expect(gapPersistHours("0")).toBe(48);
    expect(gapPersistHours("12")).toBe(24);
    expect(gapPersistHours("72")).toBe(72);
    expect(shouldSuggestReconnect(3, firstSeen, new Date("2026-10-31T19:00:00Z"), 72)).toBe(false);
  });
  it("lacuna só de hoje em BRT não gera aviso", () => {
    const now = new Date("2026-11-01T01:00:00Z"); // Ainda 31/10 BRT
    expect(shouldShowGap("2026-10-31", "2026-10-31", now)).toBe(false);
    expect(shouldShowGap("2026-10-30", "2026-10-31", now)).toBe(true);
    expect(shouldShowGap("2026-10-31", "2026-10-31", new Date("2026-11-01T03:00:00Z"))).toBe(true);
  });
  it("supersedido não entra na soma; ignorado por outro motivo continua", () => {
    const rows = [
      { amount: 254.91, raw: { _aveto_motivo: "superseded_by:posted-id" } },
      { amount: 254.91, raw: { _aveto_motivo: "outro" } },
      { amount: 10, raw: null },
    ];
    expect(rows.filter(row => countsInStatement(row.raw)).reduce((sum, row) => sum + row.amount, 0)).toBeCloseTo(264.91, 2);
    expect(countsInStatement({ _aveto_motivo: "SUPERSEDED_BY:id" })).toBe(false);
  });
  it("zera first_seen_at quando some e preserva a primeira detecção", () => {
    const now = new Date("2026-10-31T19:00:00Z");
    expect(nextGapFirstSeenAt(firstSeen, false, now)).toBeNull();
    expect(nextGapFirstSeenAt(firstSeen, true, now)).toBe(firstSeen);
    expect(nextGapFirstSeenAt(null, true, now)).toBe(now.toISOString());
  });
  it("lacuna legada ou timestamp inválido nunca sugere por contagem", () => {
    const now = new Date("2026-10-31T19:00:00Z");
    expect(shouldSuggestReconnect(100, null, now)).toBe(false);
    expect(shouldSuggestReconnect(100, "invalid", now)).toBe(false);
    expect(shouldSuggestReconnect(100, "2026-11-01T19:00:00Z", now)).toBe(false);
  });
});
