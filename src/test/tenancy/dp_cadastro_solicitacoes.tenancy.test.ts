/**
 * Tenancy tests for `dp_cadastro_solicitacoes` (finding: dp_cadastro_solicitacoes_open_insert).
 *
 * Verifies that the `members_can_create_cadastro` policy actually enforces
 * company membership on INSERT and that cross-tenant attempts fail.
 *
 * Gated by the same envs as `multi_company.tenancy.test.ts`:
 *  - A: member of TEST_COMPANY_1_ID (owner is fine)
 *  - D: member of TEST_COMPANY_2_ID (NOT a member of company 1)
 *
 * Without those envs the block is `describe.skip` so local/CI without
 * fixtures still passes. Once envs are set, each test must reproduce
 * real authorization — no silent `if (!fixture) return`.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const ENV = process.env;

const REQUIRED = [
  "TEST_SUPABASE_URL",
  "TEST_SUPABASE_ANON_KEY",
  "TEST_USER_A_EMAIL",
  "TEST_USER_A_PASSWORD",
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

function payload(companyId: string, suffix: string) {
  return {
    company_id: companyId,
    nome_completo: `RLS Cadastro Probe ${suffix}`,
    cpf: "00000000000",
    email: `rls-cadastro-${suffix}@example.com`,
    status: "pendente" as const,
  };
}

suite("Tenancy: dp_cadastro_solicitacoes (members_can_create_cadastro)", () => {
  let clientA: SupabaseClient; // member of Company 1
  let clientD: SupabaseClient; // member of Company 2 only
  const COMPANY_1 = ENV.TEST_COMPANY_1_ID!;
  const COMPANY_2 = ENV.TEST_COMPANY_2_ID!;
  const createdIds: string[] = [];

  beforeAll(async () => {
    [clientA, clientD] = await Promise.all([
      signIn(ENV.TEST_USER_A_EMAIL!, ENV.TEST_USER_A_PASSWORD!),
      signIn(ENV.TEST_USER_D_EMAIL!, ENV.TEST_USER_D_PASSWORD!),
    ]);
  });

  afterAll(async () => {
    if (createdIds.length) {
      await clientA.from("dp_cadastro_solicitacoes").delete().in("id", createdIds);
    }
  });

  it("A (member of Company 1) CAN insert a cadastro for Company 1", async () => {
    const { data, error } = await clientA
      .from("dp_cadastro_solicitacoes")
      .insert(payload(COMPANY_1, "member-ok") as never)
      .select("id")
      .single();
    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
    if (data?.id) createdIds.push(data.id);
  });

  it("D (NOT member of Company 1) CANNOT insert a cadastro for Company 1 (cross-tenant)", async () => {
    const { data, error } = await clientD
      .from("dp_cadastro_solicitacoes")
      .insert(payload(COMPANY_1, "cross-tenant") as never)
      .select();
    expect(data).toBeNull();
    expect(error).toBeTruthy();
    // 42501 = RLS row-level violation; PostgREST maps to 401/403.
    const code = error?.code ?? "";
    const status = (error as { status?: number } | null)?.status ?? 0;
    const matched =
      code === "42501" ||
      status === 401 ||
      status === 403 ||
      /row-level security|violates row-level|new row/i.test(error?.message ?? "");
    expect(matched).toBe(true);
  });

  it("A CANNOT insert a cadastro for Company 2 (not a member there)", async () => {
    const { data, error } = await clientA
      .from("dp_cadastro_solicitacoes")
      .insert(payload(COMPANY_2, "wrong-company") as never)
      .select();
    expect(data).toBeNull();
    expect(error).toBeTruthy();
  });

  it("INSERT with status != 'pendente' is rejected even for a member", async () => {
    const p = { ...payload(COMPANY_1, "bad-status"), status: "aprovado" as const };
    const { data, error } = await clientA
      .from("dp_cadastro_solicitacoes")
      .insert(p as never)
      .select();
    expect(data).toBeNull();
    expect(error).toBeTruthy();
  });
});
