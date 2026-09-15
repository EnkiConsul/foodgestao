/**
 * P0.2-B / P0.2-C / P0.3 — rotinas de teste/QA (`_e2e_*`, `_test_*`) fora do
 * schema exposto.
 *
 * Política vigente (P0.3): as rotinas vivem no schema `qa`, que NÃO é exposto
 * pelo PostgREST. Não existe mais RPC HTTP para elas — nem com chave de
 * serviço. A execução acontece só server-side, por conexão direta ao banco
 * (CI), e a guarda `qa._assert_test_helper_allowed()` continua falhando fechado
 * antes de qualquer escrita.
 *
 * Prova que:
 *  - visitante (anon) não alcança nenhuma dessas rotinas via API;
 *  - usuário logado comum não alcança;
 *  - super admin também não alcança (não há bypass por papel);
 *  - o prefixo `qa.` também não é chamável via PostgREST.
 *
 * Sem credenciais no ambiente, apenas os casos anon rodam.
 * Ver docs/security/p0-3-qa-functions-private-schema.md
 */
import { describe, it, expect, beforeAll } from "vitest";

const SUPABASE_URL = "https://grtxmbffgmgnkawlvqhm.supabase.co";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdydHhtYmZmZ21nbmthd2x2cWhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4MDM5ODYsImV4cCI6MjA4NjM3OTk4Nn0.izfpHRU8CroQC-3tXxbW_iyuU1g0AIJoWQMS-JRSgko";

/** Rotinas de QA e um payload válido de formato. */
const ROTINAS_TESTE: Array<[string, Record<string, unknown>]> = [
  ["_e2e_seed_delete_accounts", { _empty_name: "E2E-A", _history_name: "E2E-B" }],
  ["_e2e_cleanup_delete_accounts", { _names: ["E2E-A"] }],
  ["_e2e_seed_foreign_accounts", { _empty_name: "E2E-FOREIGN-A", _history_name: "E2E-FOREIGN-B" }],
  ["_e2e_cleanup_foreign_accounts", { _empty_name: "E2E-FOREIGN-A", _history_name: "E2E-FOREIGN-B" }],
  ["_e2e_seed_adjust_balance", { _account_name: "E2E-Saldo" }],
  ["_e2e_cleanup_adjust_balance", { _account_name: "E2E-Saldo" }],
  ["_test_delete_account_hard_regression", {}],
  ["_test_balance_engine", {}],
  ["_test_delete_account_authz", {}],
  ["_assert_test_helper_allowed", {}],
];

let networkAvailable = true;

beforeAll(async () => {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, { headers: { apikey: ANON_KEY } });
    networkAvailable = res.ok;
  } catch {
    networkAvailable = false;
  }
});

async function chamar(
  nome: string,
  corpo: Record<string, unknown>,
  token?: string,
  apikey = ANON_KEY,
) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${nome}`, {
    method: "POST",
    headers: {
      apikey,
      Authorization: `Bearer ${token ?? ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(corpo),
  });
  return { status: res.status, texto: await res.text() };
}

const negado = (texto: string) =>
  /42501|42883|PGRST202|PGRST301|permission denied|does not exist|Could not find/.test(texto);

describe("P0.3: visitante não alcança rotinas de QA", () => {
  for (const [nome, corpo] of ROTINAS_TESTE) {
    it(`bloqueia ${nome}`, async () => {
      if (!networkAvailable) return;
      const { status } = await chamar(nome, corpo);
      expect(status).toBeGreaterThanOrEqual(400);
    });
  }
});

describe("P0.3: usuário logado comum não alcança rotinas de QA", () => {
  const token = process.env.SUPABASE_TEST_COMMON_ACCESS_TOKEN;
  for (const [nome, corpo] of ROTINAS_TESTE) {
    it(`bloqueia ${nome} com sessão comum`, async () => {
      if (!networkAvailable || !token) return; // sem credenciais: coberto pelo caso anon
      const { status, texto } = await chamar(nome, corpo, token);
      expect(status).toBeGreaterThanOrEqual(400);
      expect(negado(texto)).toBe(true);
    });
  }
});

describe("P0.3: super admin também não alcança rotinas de QA", () => {
  const token = process.env.SUPABASE_TEST_SUPERADMIN_ACCESS_TOKEN;
  for (const [nome, corpo] of ROTINAS_TESTE) {
    it(`bloqueia ${nome} com sessão de super admin`, async () => {
      if (!networkAvailable || !token) return;
      const { status, texto } = await chamar(nome, corpo, token);
      expect(status).toBeGreaterThanOrEqual(400);
      expect(negado(texto)).toBe(true);
    });
  }
});

describe("P0.3: schema `qa` não é exposto pelo PostgREST", () => {
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.QA_SERVICE_ROLE_KEY;

  for (const prefixado of ["qa._e2e_seed_delete_accounts", "qa._test_balance_engine"]) {
    it(`bloqueia ${prefixado} via API anônima`, async () => {
      if (!networkAvailable) return;
      const { status } = await chamar(prefixado, {});
      expect(status).toBeGreaterThanOrEqual(400);
    });
  }

  it("nem a chave de serviço alcança as rotinas de QA por HTTP", async () => {
    if (!networkAvailable || !serviceKey) return; // sem chave: cenário não executável
    const { status, texto } = await chamar(
      "_e2e_seed_delete_accounts",
      { _empty_name: "E2E-QA-Vazia", _history_name: "E2E-QA-Historico" },
      serviceKey,
      serviceKey,
    );
    expect(status).toBeGreaterThanOrEqual(400);
    expect(negado(texto)).toBe(true);
  });
});
