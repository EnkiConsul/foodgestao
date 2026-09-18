/**
 * Regressão de RLS/GRANT para o conjunto cartão + extrato.
 *
 * Piso de segurança (sem credenciais): cliente anônimo não enumera nem escreve
 * cartões, faturas, lançamentos, contas/conexões do Open Finance ou o extrato
 * pendente, e não consegue descobrir em que empresa um cartão existe através
 * da função `credit_card_other_company`.
 *
 * Cenários autenticados entre duas empresas vivem em `src/test/tenancy/`.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.TEST_SUPABASE_URL!;
const ANON_KEY = process.env.TEST_SUPABASE_ANON_KEY!;

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

const TABLES = [
  "credit_cards",
  "credit_card_invoices",
  "transactions",
  "transaction_attachments",
  "pluggy_accounts",
  "pluggy_connections",
  "pluggy_staging_transactions",
] as const;

const FAKE_UUID = "00000000-0000-0000-0000-000000000000";

describe("RLS: cartões e extrato (anônimo)", () => {
  for (const table of TABLES) {
    it(`bloqueia enumeração anônima em ${table}`, async () => {
      if (!networkAvailable) throw new Error('Backend de homologação indisponível; teste não executado.');
      const { data, error } = await anon()
        .from(table as never)
        .select("id")
        .limit(1);
      if (error) expect(error).toBeTruthy();
      else expect(data?.length ?? 0).toBe(0);
    });

    it(`bloqueia UPDATE anônimo em ${table}`, async () => {
      if (!networkAvailable) throw new Error('Backend de homologação indisponível; teste não executado.');
      const { data, error } = await anon()
        .from(table as never)
        .update({ company_id: FAKE_UUID } as never)
        .eq("id", FAKE_UUID)
        .select("id");
      expect(error || (data?.length ?? 0) === 0).toBeTruthy();
    });

    it(`bloqueia DELETE anônimo em ${table}`, async () => {
      if (!networkAvailable) throw new Error('Backend de homologação indisponível; teste não executado.');
      const { data, error } = await anon()
        .from(table as never)
        .delete()
        .eq("id", FAKE_UUID)
        .select("id");
      expect(error || (data?.length ?? 0) === 0).toBeTruthy();
    });
  }

  it("não revela em qual empresa um cartão existe (credit_card_other_company)", async () => {
    if (!networkAvailable) throw new Error('Backend de homologação indisponível; teste não executado.');
    const { data, error } = await anon().rpc("credit_card_other_company", {
      _company_id: FAKE_UUID,
      _number: "2691",
    } as never);
    expect(error || data === null || data === "").toBeTruthy();
  });
});
