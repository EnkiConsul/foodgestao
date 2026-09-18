/**
 * Bloco F — Regressão de RLS para `categories` e `category_companies`.
 *
 * Valida, contra o backend real e sem credenciais, que anônimos são bloqueados
 * de ler ou escrever tanto na tabela principal quanto na junção multiempresa.
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

describe("RLS: categories (Bloco F)", () => {
  it("bloqueia SELECT anônimo em categories", async () => {
    if (!networkAvailable) throw new Error('Backend de homologação indisponível; teste não executado.');
    const { data, error } = await anon().from("categories").select("id").limit(1);
    if (error) {
      expect(error).toBeTruthy();
    } else {
      expect(data?.length ?? 0).toBe(0);
    }
  });

  it("bloqueia INSERT anônimo em categories", async () => {
    if (!networkAvailable) throw new Error('Backend de homologação indisponível; teste não executado.');
    const { data, error } = await anon()
      .from("categories")
      .insert({
        user_id: "00000000-0000-0000-0000-000000000000",
        name: "rls-probe",
        transaction_type: "saida",
        context: "pf",
      } as never)
      .select();
    expect(data).toBeNull();
    expect(error).toBeTruthy();
  });

  it("bloqueia SELECT anônimo em category_companies", async () => {
    if (!networkAvailable) throw new Error('Backend de homologação indisponível; teste não executado.');
    const { data, error } = await anon()
      .from("category_companies")
      .select("category_id")
      .limit(1);
    if (error) {
      expect(error).toBeTruthy();
    } else {
      expect(data?.length ?? 0).toBe(0);
    }
  });

  it("bloqueia INSERT anônimo em category_companies", async () => {
    if (!networkAvailable) throw new Error('Backend de homologação indisponível; teste não executado.');
    const { error } = await anon()
      .from("category_companies")
      .insert({
        category_id: "00000000-0000-0000-0000-000000000000",
        company_id: "00000000-0000-0000-0000-000000000000",
      } as never);
    expect(error).toBeTruthy();
  });
});
