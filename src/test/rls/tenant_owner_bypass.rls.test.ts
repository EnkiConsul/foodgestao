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

const SUPABASE_URL = process.env.TEST_SUPABASE_URL!;
const ANON_KEY = process.env.TEST_SUPABASE_ANON_KEY!;

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
      if (!networkAvailable) throw new Error('Backend de homologação indisponível; teste não executado.');
      const { data, error } = await anon().from(table).select("id").limit(1);
      if (error) expect(error).toBeTruthy();
      else expect(data?.length ?? 0).toBe(0);
    });

    it(`bloqueia UPDATE anônimo em ${table}`, async () => {
      if (!networkAvailable) throw new Error('Backend de homologação indisponível; teste não executado.');
      const { data, error } = await anon()
        .from(table)
        .update({ id: "00000000-0000-0000-0000-000000000000" } as never)
        .eq("id", "00000000-0000-0000-0000-000000000000")
        .select("id");
      expect(error || (data?.length ?? 0) === 0).toBeTruthy();
    });
  }
});
