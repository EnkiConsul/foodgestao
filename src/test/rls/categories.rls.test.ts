/**
 * Bloco F — Regressão de RLS para `categories` e `category_companies`.
 *
 * Valida, contra o backend real e sem credenciais, que anônimos são bloqueados
 * de ler ou escrever tanto na tabela principal quanto na junção multiempresa.
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

describe("RLS: categories (Bloco F)", () => {
  it("bloqueia SELECT anônimo em categories", async () => {
    if (!networkAvailable) return;
    const { data, error } = await anon().from("categories").select("id").limit(1);
    if (error) {
      expect(error).toBeTruthy();
    } else {
      expect(data?.length ?? 0).toBe(0);
    }
  });

  it("bloqueia INSERT anônimo em categories", async () => {
    if (!networkAvailable) return;
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
    if (!networkAvailable) return;
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
    if (!networkAvailable) return;
    const { error } = await anon()
      .from("category_companies")
      .insert({
        category_id: "00000000-0000-0000-0000-000000000000",
        company_id: "00000000-0000-0000-0000-000000000000",
      } as never);
    expect(error).toBeTruthy();
  });
});
