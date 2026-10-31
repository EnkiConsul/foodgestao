import { describe, it, expect } from "vitest";
import { checkItemOwnership } from "../../../supabase/functions/_shared/pluggy-ownership";

const now = Date.parse("2026-10-31T12:00:00Z");
const req = (id: string, user: string, company: string, h = 1) => ({
  id, user_id: user, company_id: company, created_at: new Date(now - h * 3600_000).toISOString(),
});

describe("prova de posse do item Pluggy", () => {
  it("aceita ofreq da mesma empresa e usuário", () => {
    expect(checkItemOwnership("ofreq:r1", "u1", "c1", [req("r1", "u1", "c1")], now).ok).toBe(true);
  });
  it("recusa item de outra empresa", () => {
    expect(checkItemOwnership("ofreq:r1", "u1", "c1", [req("r1", "u1", "c2")], now).ok).toBe(false);
  });
  it("recusa item de outro usuário", () => {
    expect(checkItemOwnership("ofreq:r1", "u1", "c1", [req("r1", "u2", "c1")], now).ok).toBe(false);
  });
  it("recusa solicitação com mais de 24h", () => {
    expect(checkItemOwnership("ofreq:r1", "u1", "c1", [req("r1", "u1", "c1", 25)], now).ok).toBe(false);
  });
  it("aceita legado com solicitação recente", () => {
    expect(checkItemOwnership("u1", "u1", "c1", [req("r9", "u1", "c1")], now)).toMatchObject({ ok: true, via: "legacy" });
  });
  it("recusa legado sem solicitação recente", () => {
    expect(checkItemOwnership("u1", "u1", "c1", [], now).ok).toBe(false);
  });
  it("recusa item sem clientUserId", () => {
    expect(checkItemOwnership(null, "u1", "c1", [req("r1", "u1", "c1")], now))
      .toEqual({ ok: false, reason: "missing_client_user_id" });
  });
});
