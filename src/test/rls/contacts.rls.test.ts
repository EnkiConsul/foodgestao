/**
 * Bloco G — Regressão de RLS para `contacts` e `contact_companies`.
 * Confirma bloqueio de acesso anônimo à base de clientes/fornecedores.
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

describe("RLS: contacts (Bloco G)", () => {
  it("bloqueia SELECT anônimo em contacts", async () => {
    if (!networkAvailable) throw new Error('Backend de homologação indisponível; teste não executado.');
    const { data, error } = await anon().from("contacts").select("id").limit(1);
    if (error) expect(error).toBeTruthy();
    else expect(data?.length ?? 0).toBe(0);
  });

  it("bloqueia INSERT anônimo em contacts", async () => {
    if (!networkAvailable) throw new Error('Backend de homologação indisponível; teste não executado.');
    const { data, error } = await anon()
      .from("contacts")
      .insert({
        user_id: "00000000-0000-0000-0000-000000000000",
        name: "rls-probe",
        contact_type: "cliente",
      } as never)
      .select();
    expect(data).toBeNull();
    expect(error).toBeTruthy();
  });

  it("bloqueia SELECT anônimo em contact_companies", async () => {
    if (!networkAvailable) throw new Error('Backend de homologação indisponível; teste não executado.');
    const { data, error } = await anon()
      .from("contact_companies")
      .select("contact_id")
      .limit(1);
    if (error) expect(error).toBeTruthy();
    else expect(data?.length ?? 0).toBe(0);
  });

  it("bloqueia INSERT anônimo em contact_companies", async () => {
    if (!networkAvailable) throw new Error('Backend de homologação indisponível; teste não executado.');
    const { error } = await anon()
      .from("contact_companies")
      .insert({
        contact_id: "00000000-0000-0000-0000-000000000000",
        company_id: "00000000-0000-0000-0000-000000000000",
      } as never);
    expect(error).toBeTruthy();
  });
});
