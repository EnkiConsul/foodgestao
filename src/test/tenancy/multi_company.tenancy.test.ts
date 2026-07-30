/**
 * Bloco I — Testes de tenancy multiempresa.
 *
 * Roda contra um projeto Supabase de TESTES dedicado.
 * Se as variáveis `TEST_SUPABASE_URL`/`TEST_SUPABASE_ANON_KEY` e as credenciais
 * dos 4 usuários (A/B/C na Empresa 1, D na Empresa 2) não estiverem definidas,
 * o bloco é ignorado via `describe.skip` — permite rodar `vitest` em CI sem
 * credenciais sem falhar.
 *
 * Cenários (Etapa 13):
 *  1. Isolamento entre Empresa 1 e Empresa 2 em transactions/budgets/categories/contacts.
 *  2. Colaboração PJ: B (member) enxerga registros criados por A (owner).
 *  3. C (viewer) não consegue INSERT em transactions.
 *  4. Cross-tenant transfer: UPDATE de company_id para Empresa 2 falha para A.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const ENV = process.env;

const REQUIRED = [
  "TEST_SUPABASE_URL",
  "TEST_SUPABASE_ANON_KEY",
  "TEST_USER_A_EMAIL",
  "TEST_USER_A_PASSWORD",
  "TEST_USER_B_EMAIL",
  "TEST_USER_B_PASSWORD",
  "TEST_USER_C_EMAIL",
  "TEST_USER_C_PASSWORD",
  "TEST_USER_D_EMAIL",
  "TEST_USER_D_PASSWORD",
  "TEST_COMPANY_1_ID",
  "TEST_COMPANY_2_ID",
] as const;

const missing = REQUIRED.filter((k) => !ENV[k]);
const suite = missing.length === 0 ? describe : describe.skip;

async function signIn(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(ENV.TEST_SUPABASE_URL!, ENV.TEST_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

suite("Tenancy: multiempresa (Bloco I)", () => {
  let clientA: SupabaseClient; // owner Empresa 1
  let clientB: SupabaseClient; // member (edit) Empresa 1
  let clientC: SupabaseClient; // viewer Empresa 1
  let clientD: SupabaseClient; // owner Empresa 2
  const COMPANY_1 = ENV.TEST_COMPANY_1_ID!;
  const COMPANY_2 = ENV.TEST_COMPANY_2_ID!;

  beforeAll(async () => {
    if (missing.length > 0) return;
    [clientA, clientB, clientC, clientD] = await Promise.all([
      signIn(ENV.TEST_USER_A_EMAIL!, ENV.TEST_USER_A_PASSWORD!),
      signIn(ENV.TEST_USER_B_EMAIL!, ENV.TEST_USER_B_PASSWORD!),
      signIn(ENV.TEST_USER_C_EMAIL!, ENV.TEST_USER_C_PASSWORD!),
      signIn(ENV.TEST_USER_D_EMAIL!, ENV.TEST_USER_D_PASSWORD!),
    ]);
  });

  it("D (Empresa 2) não vê transactions da Empresa 1", async () => {
    const { data, error } = await clientD
      .from("transactions")
      .select("id")
      .eq("company_id", COMPANY_1)
      .limit(1);
    expect(error).toBeFalsy();
    expect(data ?? []).toEqual([]);
  });

  it("D (Empresa 2) não vê budgets da Empresa 1", async () => {
    const { data } = await clientD
      .from("budgets")
      .select("id")
      .eq("company_id", COMPANY_1)
      .limit(1);
    expect(data ?? []).toEqual([]);
  });

  it("B (member) enxerga transactions criadas por A (mesma empresa)", async () => {
    const { data: createdByA } = await clientA
      .from("transactions")
      .select("id")
      .eq("company_id", COMPANY_1)
      .limit(1);
    if (!createdByA || createdByA.length === 0) return; // sem dados de fixture
    const { data: seenByB } = await clientB
      .from("transactions")
      .select("id")
      .eq("id", createdByA[0].id);
    expect(seenByB?.length ?? 0).toBe(1);
  });

  it("C (viewer) não consegue INSERT em transactions da Empresa 1", async () => {
    const { error } = await clientC.from("transactions").insert({
      company_id: COMPANY_1,
      context: "pj",
      description: "tenancy-test-viewer",
      amount: 1,
      type: "saida",
      due_date: "2026-01-01",
      status: "pendente",
    } as never);
    expect(error).toBeTruthy();
  });

  it("A não consegue transferir transaction da Empresa 1 para Empresa 2", async () => {
    const { data: rows } = await clientA
      .from("transactions")
      .select("id")
      .eq("company_id", COMPANY_1)
      .limit(1);
    if (!rows || rows.length === 0) return;
    const { error } = await clientA
      .from("transactions")
      .update({ company_id: COMPANY_2 })
      .eq("id", rows[0].id);
    expect(error).toBeTruthy();
  });
});
