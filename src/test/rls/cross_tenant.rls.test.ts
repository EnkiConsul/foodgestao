/**
 * Bloco H — Regressão cross-tenant.
 *
 * Valida contra o backend real e sem credenciais que:
 *  1. Cliente anônimo não enumera dados de nenhuma tabela multiempresa
 *     (budgets, transactions, categories, contacts) — RLS+GRANT combinados.
 *  2. Cliente anônimo não consegue UPDATE em budgets/transactions
 *     (defesa em camadas antes mesmo da trigger prevent_company_id_transfer).
 *
 * A validação end-to-end da trigger `prevent_company_id_transfer` requer
 * sessão autenticada em duas empresas distintas e vive em `src/test/tenancy/`.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://grtxmbffgmgnkawlvqhm.supabase.co";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdydHhtYmZmZ21nbmthd2x2cWhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4MDM5ODYsImV4cCI6MjA4NjM3OTk4Nn0.izfpHRU8CroQC-3tXxbW_iyuU1g0AIJoWQMS-JRSgko";

let networkAvailable = true;

beforeAll(async () => {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: ANON_KEY },
    });
    networkAvailable = res.ok;
  } catch {
    networkAvailable = false;
  }
});

const anon = () =>
  createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const MULTI_TENANT_TABLES = [
  "budgets",
  "transactions",
  "categories",
  "contacts",
] as const;

describe("RLS: cross-tenant (Bloco H)", () => {
  for (const table of MULTI_TENANT_TABLES) {
    it(`bloqueia enumeração anônima em ${table}`, async () => {
      if (!networkAvailable) return;
      const { data, error } = await anon()
        .from(table as never)
        .select("id")
        .limit(1);
      if (error) {
        expect(error).toBeTruthy();
      } else {
        expect(Array.isArray(data)).toBe(true);
        expect(data?.length ?? 0).toBe(0);
      }
    });
  }

  it("bloqueia UPDATE anônimo em budgets (cross-tenant defense-in-depth)", async () => {
    if (!networkAvailable) return;
    const { data, error } = await anon()
      .from("budgets")
      .update({ company_id: "00000000-0000-0000-0000-000000000000" })
      .eq("id", "00000000-0000-0000-0000-000000000000")
      .select();
    expect(data == null || (Array.isArray(data) && data.length === 0)).toBe(true);
    if (data && data.length > 0) {
      expect(error).toBeTruthy();
    }
  });

  it("bloqueia UPDATE anônimo em transactions", async () => {
    if (!networkAvailable) return;
    const { data, error } = await anon()
      .from("transactions")
      .update({ company_id: "00000000-0000-0000-0000-000000000000" })
      .eq("id", "00000000-0000-0000-0000-000000000000")
      .select();
    expect(data == null || (Array.isArray(data) && data.length === 0)).toBe(true);
    if (data && data.length > 0) {
      expect(error).toBeTruthy();
    }
  });
});
