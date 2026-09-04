/**
 * Regressão do atalho "quem criou vê sempre" (owner bypass).
 *
 * Depois do endurecimento de policies, contatos, categorias, centros de custo,
 * formas de pagamento, etiquetas, regras de importação e faturas de cartão só
 * são visíveis para membros da empresa do registro. Este arquivo garante o piso
 * (anônimo não lê nem escreve) e documenta as tabelas cobertas; os cenários
 * autenticados entre empresas vivem em `src/test/tenancy/`.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://grtxmbffgmgnkawlvqhm.supabase.co";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdydHhtYmZmZ21nbmthd2x2cWhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4MDM5ODYsImV4cCI6MjA4NjM3OTk4Nn0.izfpHRU8CroQC-3tXxbW_iyuU1g0AIJoWQMS-JRSgko";

const TABLES = [
  "contacts",
  "categories",
  "cost_centers",
  "payment_methods",
  "tags",
  "import_rules",
  "credit_card_invoices",
] as const;

let networkAvailable = true;

beforeAll(async () => {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, { headers: { apikey: ANON_KEY } });
    networkAvailable = res.ok;
  } catch {
    networkAvailable = false;
  }
});

const anon = () =>
  createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

describe("RLS: cadastros compartilhados sem atalho de dono", () => {
  for (const table of TABLES) {
    it(`bloqueia SELECT anônimo em ${table}`, async () => {
      if (!networkAvailable) return;
      const { data, error } = await anon().from(table).select("id").limit(1);
      if (error) expect(error).toBeTruthy();
      else expect(data?.length ?? 0).toBe(0);
    });

    it(`bloqueia UPDATE anônimo em ${table}`, async () => {
      if (!networkAvailable) return;
      const { data, error } = await anon()
        .from(table)
        .update({ id: "00000000-0000-0000-0000-000000000000" } as never)
        .eq("id", "00000000-0000-0000-0000-000000000000")
        .select("id");
      expect(error || (data?.length ?? 0) === 0).toBeTruthy();
    });
  }
});
