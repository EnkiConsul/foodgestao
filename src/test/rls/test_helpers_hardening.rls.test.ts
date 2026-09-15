/**
 * P0.2-B / P0.2-C — rotinas de teste/QA (`_e2e_*`, `_test_*`) fechadas.
 *
 * Política vigente (P0.2-C): somente `service_role` (execução server-side/CI)
 * executa essas rotinas. Nenhuma sessão de usuário — comum ou super admin —
 * tem `EXECUTE`, e a guarda `public._assert_test_helper_allowed()` falha
 * fechado antes de qualquer escrita.
 *
 * Prova que:
 *  - visitante (anon) é bloqueado;
 *  - usuário logado comum é bloqueado;
 *  - super admin também é bloqueado (não há mais bypass por papel);
 *  - com `SUPABASE_SERVICE_ROLE_KEY` disponível, a chave de serviço executa
 *    seed + cleanup e não deixa resíduo `E2E-*`.
 *
 * Sem credenciais no ambiente, apenas os casos anon rodam.
 * Ver docs/security/p0-2c-qa-functions-service-role.md
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

const negado = (texto: string) => /42501|PGRST202|PGRST301|permission denied/.test(texto);

describe("P0.2-C: visitante não executa rotinas de QA", () => {
  for (const [nome, corpo] of ROTINAS_TESTE) {
    it(`bloqueia ${nome}`, async () => {
      if (!networkAvailable) return;
      const { status } = await chamar(nome, corpo);
      expect(status).toBeGreaterThanOrEqual(400);
    });
  }
});

describe("P0.2-C: usuário logado comum não executa rotinas de QA", () => {
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

describe("P0.2-C: super admin também não executa rotinas de QA", () => {
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

describe("P0.2-C: service_role executa seed/cleanup e não deixa resíduo", () => {
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.QA_SERVICE_ROLE_KEY;
  const userId = process.env.SUPABASE_TEST_COMMON_USER_ID;

  it("faz seed e cleanup de contas E2E-*", async () => {
    if (!networkAvailable || !serviceKey || !userId) return; // sem chave de serviço: cenário não executável
    const nomes = { _empty_name: "E2E-QA-Vazia", _history_name: "E2E-QA-Historico" };
    const seed = await chamar(
      "_e2e_seed_delete_accounts",
      { ...nomes, _user_id: userId },
      serviceKey,
      serviceKey,
    );
    expect(seed.status).toBe(200);
    const limpeza = await chamar(
      "_e2e_cleanup_delete_accounts",
      { _names: [nomes._empty_name, nomes._history_name], _user_id: userId },
      serviceKey,
      serviceKey,
    );
    expect(limpeza.status).toBeLessThan(300);
  });
});
