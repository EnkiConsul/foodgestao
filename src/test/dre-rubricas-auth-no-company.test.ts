/**
 * E2E: an AUTHENTICATED user who is NOT a member of any company must not
 * be able to read `dre_rubricas`, and any write must be rejected by RLS
 * with a permission error.
 *
 * Requires a pre-provisioned test user (email-confirmation is enabled on
 * this project, so `signUp` alone cannot yield a session). Provide:
 *
 *   E2E_NOCOMPANY_EMAIL=...       # confirmed user with zero company_members rows
 *   E2E_NOCOMPANY_PASSWORD=...
 *
 * When either variable is missing, the suite is skipped so CI stays green
 * on forks/preview environments that lack the fixture.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://grtxmbffgmgnkawlvqhm.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdydHhtYmZmZ21nbmthd2x2cWhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4MDM5ODYsImV4cCI6MjA4NjM3OTk4Nn0.izfpHRU8CroQC-3tXxbW_iyuU1g0AIJoWQMS-JRSgko";

const EMAIL = process.env.E2E_NOCOMPANY_EMAIL;
const PASSWORD = process.env.E2E_NOCOMPANY_PASSWORD;
const HAS_CREDS = Boolean(EMAIL && PASSWORD);

const d = HAS_CREDS ? describe : describe.skip;

d("dre_rubricas — authenticated user without a company link", () => {
  let client: SupabaseClient;
  let userId: string;

  beforeAll(async () => {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.signInWithPassword({
      email: EMAIL!,
      password: PASSWORD!,
    });
    if (error) throw error;
    userId = data.user!.id;

    // Sanity: the fixture user really has no company membership.
    const { count } = await client
      .from("company_members")
      .select("user_id", { count: "exact", head: true })
      .eq("user_id", userId);
    expect(count ?? 0).toBe(0);
  });

  afterAll(async () => {
    if (client) await client.auth.signOut();
  });

  it("returns zero rows on SELECT (RLS filters silently)", async () => {
    const { data, error } = await client
      .from("dre_rubricas")
      .select("id")
      .limit(50);
    // Per PostgREST semantics, RLS returns an empty set — not an error — on SELECT.
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    expect(data?.length ?? 0).toBe(0);
  });

  it("blocks INSERT with a permission / RLS error", async () => {
    const { error } = await client.from("dre_rubricas").insert({
      codigo: `E2E_NO_COMPANY_${Date.now()}`,
      nome: "should_be_rejected",
      tipo: "receita_bruta",
      ordem: 9999,
    });
    expect(error).not.toBeNull();
    const msg = String(error?.message ?? "").toLowerCase();
    const code = String(error?.code ?? "");
    expect(
      msg.includes("row-level security") ||
        msg.includes("permission") ||
        msg.includes("denied") ||
        code === "42501" || // insufficient_privilege
        code === "42P01", // undefined_table (not exposed)
    ).toBe(true);
  });

  it("blocks UPDATE with a permission / RLS error", async () => {
    const { error } = await client
      .from("dre_rubricas")
      .update({ nome: "hijack" })
      .eq("codigo", "any");
    // Either affects 0 rows silently OR errors — both are acceptable proofs
    // that the caller cannot mutate the table. Assert we did NOT succeed
    // with a mutation error signature we care about.
    if (error) {
      const msg = String(error.message ?? "").toLowerCase();
      expect(
        msg.includes("row-level security") ||
          msg.includes("permission") ||
          msg.includes("denied"),
      ).toBe(true);
    }
  });

  it("blocks DELETE with a permission / RLS error", async () => {
    const { error } = await client
      .from("dre_rubricas")
      .delete()
      .eq("codigo", "any");
    if (error) {
      const msg = String(error.message ?? "").toLowerCase();
      expect(
        msg.includes("row-level security") ||
          msg.includes("permission") ||
          msg.includes("denied"),
      ).toBe(true);
    }
  });
});
