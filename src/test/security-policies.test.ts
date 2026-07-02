/**
 * End-to-end authorization tests against the live Data API using the anon key.
 *
 * These tests validate the RLS policies and function grants added by the
 * security-hardening migration:
 *   - dre_rubricas               → only company members (auth required)
 *   - dre_snapshot_lock_published → internal trigger; not executable via API
 *   - landing_content            → only rows with is_published = true are public
 */
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://grtxmbffgmgnkawlvqhm.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdydHhtYmZmZ21nbmthd2x2cWhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4MDM5ODYsImV4cCI6MjA4NjM3OTk4Nn0.izfpHRU8CroQC-3tXxbW_iyuU1g0AIJoWQMS-JRSgko";

const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

describe("dre_rubricas — company-scoped read policy", () => {
  it("returns no rows for anonymous (unauthenticated) callers", async () => {
    const { data, error } = await anon.from("dre_rubricas").select("id").limit(5);
    // RLS with role = authenticated + no anon policy → PostgREST returns [] (not an error).
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    expect(data?.length ?? 0).toBe(0);
  });

  it("does not allow anon INSERT into dre_rubricas", async () => {
    const { error } = await anon
      .from("dre_rubricas")
      .insert({ codigo: "TEST_ANON", nome: "should_fail", tipo: "receita_bruta", ordem: 9999 });
    expect(error).not.toBeNull();
  });
});

describe("dre_snapshot_lock_published — internal trigger function", () => {
  it("cannot be called by anonymous clients via RPC", async () => {
    // Intentionally calling an internal function that isn't in generated types.
    const { error } = await (anon.rpc as unknown as (fn: string) => Promise<{ error: unknown }>)(
      "dre_snapshot_lock_published",
    );
    // Expect either "function does not exist" (not exposed) or a permission error.
    expect(error).not.toBeNull();
    const msg = (error?.message ?? "").toLowerCase();
    expect(
      msg.includes("permission") ||
        msg.includes("denied") ||
        msg.includes("does not exist") ||
        msg.includes("not found") ||
        msg.includes("could not find"),
    ).toBe(true);
  });
});

describe("landing_content — public reads only for published rows", () => {
  it("all rows returned to anon must have is_published = true", async () => {
    const { data, error } = await anon
      .from("landing_content")
      .select("id, section, is_published")
      .limit(100);

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    for (const row of data ?? []) {
      expect(row.is_published).toBe(true);
    }
  });

  it("explicit filter for unpublished rows returns nothing to anon", async () => {
    const { data, error } = await anon
      .from("landing_content")
      .select("id")
      .eq("is_published", false)
      .limit(10);
    expect(error).toBeNull();
    expect(data?.length ?? 0).toBe(0);
  });

  it("does not allow anon writes to landing_content", async () => {
    const { error } = await anon
      .from("landing_content")
      .insert({ section: "test_anon_write", content: {}, is_published: true });
    expect(error).not.toBeNull();
  });
});
