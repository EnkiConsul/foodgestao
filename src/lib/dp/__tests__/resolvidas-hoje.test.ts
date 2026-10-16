import { describe, expect, it } from "vitest";
import { contarResolvidas, diaBrasilia, registrarResolvida } from "../resolvidas-hoje";

function mem() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe("resolvidas hoje", () => {
  it("usa o dia de Brasília (02:00 UTC ainda é o dia anterior)", () => {
    expect(diaBrasilia(new Date("2026-10-17T02:00:00Z"))).toBe("2026-10-16");
  });
  it("a mesma ação conta uma vez só", () => {
    const st = mem(); const d = new Date("2026-10-16T15:00:00Z");
    registrarResolvida("c1", "a", st, d); registrarResolvida("c1", "a", st, d);
    expect(contarResolvidas("c1", st, d)).toBe(1);
  });
  it("zera no dia seguinte e separa empresas", () => {
    const st = mem();
    registrarResolvida("c1", "a", st, new Date("2026-10-16T15:00:00Z"));
    expect(contarResolvidas("c1", st, new Date("2026-10-17T15:00:00Z"))).toBe(0);
    expect(contarResolvidas("c2", st, new Date("2026-10-16T15:00:00Z"))).toBe(0);
  });
});
