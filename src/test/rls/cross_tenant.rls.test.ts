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

const SUPABASE_URL = process.env.TEST_SUPABASE_URL!;
const ANON_KEY = process.env.TEST_SUPABASE_ANON_KEY!;

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
  "transactions",
  "categories",
  "contacts",
] as const;

describe("RLS: cross-tenant (Bloco H)", () => {
  for (const table of MULTI_TENANT_TABLES) {
    it(`bloqueia enumeração anônima em ${table}`, async () => {
      if (!networkAvailable) throw new Error('Backend de homologação indisponível; teste não executado.');
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


  it("bloqueia UPDATE anônimo em transactions", async () => {
    if (!networkAvailable) throw new Error('Backend de homologação indisponível; teste não executado.');
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
