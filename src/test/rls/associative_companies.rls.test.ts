/**
 * Correção RLS — Tabelas associativas multiempresa.
 *
 * Bloqueia acesso anônimo (SELECT/INSERT/DELETE) a category_companies,
 * contact_companies, payment_method_companies e chart_account_companies.
 * Fixtures autenticadas de A/B/C/D estão em src/test/tenancy/.
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

const ZERO = "00000000-0000-0000-0000-000000000000";

type TableSpec = {
  table:
    | "category_companies"
    | "contact_companies"
    | "payment_method_companies"
    | "chart_account_companies";
  entityColumn:
    | "category_id"
    | "contact_id"
    | "payment_method_id"
    | "chart_account_id";
};

const specs: TableSpec[] = [
  { table: "category_companies", entityColumn: "category_id" },
  { table: "contact_companies", entityColumn: "contact_id" },
  { table: "payment_method_companies", entityColumn: "payment_method_id" },
  { table: "chart_account_companies", entityColumn: "chart_account_id" },
];

describe.each(specs)("RLS: %s (anon bloqueado)", ({ table, entityColumn }) => {
  it(`bloqueia SELECT anônimo em ${table}`, async () => {
    if (!networkAvailable) return;
    const { data, error } = await anon().from(table).select("company_id").limit(1);
    if (error) {
      expect(error).toBeTruthy();
    } else {
      expect(data?.length ?? 0).toBe(0);
    }
  });

  it(`bloqueia INSERT anônimo em ${table}`, async () => {
    if (!networkAvailable) return;
    const payload = { company_id: ZERO, [entityColumn]: ZERO } as never;
    const { data, error } = await anon().from(table).insert(payload).select();
    expect(data).toBeNull();
    expect(error).toBeTruthy();
  });

  it(`bloqueia DELETE anônimo em ${table}`, async () => {
    if (!networkAvailable) return;
    const { error } = await anon().from(table).delete().eq("company_id", ZERO);
    expect(error).toBeTruthy();
  });
});
