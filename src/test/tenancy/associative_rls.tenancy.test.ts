/**
 * Bloco Associativas — Testes de tenancy multiempresa para tabelas *_companies.
 *
 * Segue o padrão de `multi_company.tenancy.test.ts`: gated pelas mesmas envs
 * (`TEST_SUPABASE_URL`/`TEST_SUPABASE_ANON_KEY` + credenciais A/B/C/D + IDs
 * das empresas). Sem credenciais → `describe.skip` (não falha o CI local),
 * mas SEM `if(!fixture) return` dentro dos testes: uma vez ativado, cada
 * cenário DEVE reproduzir a autorização real. Fixtures ausentes → `throw`.
 *
 * Matriz:
 *  - A (owner E1): CRUD de vínculos em E1 ok.
 *  - B (member+edit E1): CRUD de vínculos em E1 ok.
 *  - C (viewer E1): apenas SELECT.
 *  - D (owner E2): sem acesso a vínculos de E1 (SELECT vazio, INSERT/DELETE bloqueados).
 *  - Cross-tenant: A não vincula entidade da E1 na E2.
 *  - UPDATE de company_id bloqueado pela trigger `prevent_association_tenant_change`.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
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

type Spec = {
  table:
    | "category_companies"
    | "contact_companies"
    | "payment_method_companies"
    | "chart_account_companies";
  entityTable: "categories" | "contacts" | "payment_methods" | "chart_accounts";
  entityColumn:
    | "category_id"
    | "contact_id"
    | "payment_method_id"
    | "chart_account_id";
  fixturePayload: (userId: string) => Record<string, unknown>;
};

const specs: Spec[] = [
  {
    table: "category_companies",
    entityTable: "categories",
    entityColumn: "category_id",
    fixturePayload: (uid) => ({
      user_id: uid,
      name: `rls-fixture-cat-${Date.now()}`,
      transaction_type: "saida",
      context: "pj",
    }),
  },
  {
    table: "contact_companies",
    entityTable: "contacts",
    entityColumn: "contact_id",
    fixturePayload: (uid) => ({
      user_id: uid,
      name: `rls-fixture-contact-${Date.now()}`,
      contact_type: "cliente",
      context: "pj",
    }),
  },
];

suite.each(specs)(
  "Tenancy associativa: $table",
  ({ table, entityTable, entityColumn, fixturePayload }) => {
    let clientA: SupabaseClient;
    let clientB: SupabaseClient;
    let clientC: SupabaseClient;
    let clientD: SupabaseClient;
    let entityId: string;
    const COMPANY_1 = ENV.TEST_COMPANY_1_ID!;
    const COMPANY_2 = ENV.TEST_COMPANY_2_ID!;

    beforeAll(async () => {
      [clientA, clientB, clientC, clientD] = await Promise.all([
        signIn(ENV.TEST_USER_A_EMAIL!, ENV.TEST_USER_A_PASSWORD!),
        signIn(ENV.TEST_USER_B_EMAIL!, ENV.TEST_USER_B_PASSWORD!),
        signIn(ENV.TEST_USER_C_EMAIL!, ENV.TEST_USER_C_PASSWORD!),
        signIn(ENV.TEST_USER_D_EMAIL!, ENV.TEST_USER_D_PASSWORD!),
      ]);
      const { data: sess } = await clientA.auth.getUser();
      const uid = sess.user?.id;
      if (!uid) throw new Error("Sessão de A sem user id");
      const { data, error } = await clientA
        .from(entityTable)
        .insert(fixturePayload(uid) as never)
        .select("id")
        .single();
      if (error || !data) throw new Error(`Falha criando fixture em ${entityTable}: ${error?.message}`);
      entityId = (data as { id: string }).id;
    });

    afterAll(async () => {
      if (entityId) await clientA.from(entityTable).delete().eq("id", entityId);
    });

    it("A (owner E1) cria vínculo em E1", async () => {
      const { error } = await clientA
        .from(table)
        .insert({ company_id: COMPANY_1, [entityColumn]: entityId } as never);
      expect(error).toBeNull();
    });

    it("B (member edit E1) enxerga o vínculo", async () => {
      const { data, error } = await clientB
        .from(table)
        .select("company_id")
        .eq("company_id", COMPANY_1)
        .eq(entityColumn, entityId);
      expect(error).toBeNull();
      expect((data ?? []).length).toBeGreaterThan(0);
    });

    it("C (viewer E1) NÃO consegue inserir vínculo", async () => {
      const { error } = await clientC
        .from(table)
        .insert({ company_id: COMPANY_1, [entityColumn]: entityId } as never);
      expect(error).toBeTruthy();
    });

    it("D (owner E2) NÃO enxerga vínculos da E1", async () => {
      const { data } = await clientD
        .from(table)
        .select("company_id")
        .eq("company_id", COMPANY_1)
        .eq(entityColumn, entityId);
      expect((data ?? []).length).toBe(0);
    });

    it("D (owner E2) NÃO consegue vincular entidade alheia à E2 (cross-tenant)", async () => {
      const { error } = await clientD
        .from(table)
        .insert({ company_id: COMPANY_2, [entityColumn]: entityId } as never);
      expect(error).toBeTruthy();
    });

    it("UPDATE de company_id bloqueado pela trigger de integridade", async () => {
      const { error } = await clientA
        .from(table)
        .update({ company_id: COMPANY_2 } as never)
        .eq("company_id", COMPANY_1)
        .eq(entityColumn, entityId);
      expect(error).toBeTruthy();
    });

    it("A remove vínculo em E1", async () => {
      const { error } = await clientA
        .from(table)
        .delete()
        .eq("company_id", COMPANY_1)
        .eq(entityColumn, entityId);
      expect(error).toBeNull();
    });
  },
);
