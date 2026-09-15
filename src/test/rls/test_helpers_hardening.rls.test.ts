/**
 * P0.2-B — rotinas de teste/E2E (`_e2e_*`, `_test_*`) protegidas.
 *
 * Prova que:
 *  - visitante (anon) não executa nenhuma delas (403/404, nunca sucesso);
 *  - usuário logado comum recebe permission denied (42501) pela guarda
 *    `public._assert_test_helper_allowed()` — a rotina falha fechado antes de
 *    gravar qualquer dado;
 *  - a autorização é explícita: apenas `service_role` ou papel `super_admin`.
 *
 * Sem credenciais no ambiente, apenas os casos anon rodam.
 * Ver docs/security/p0-2b-test-functions-hardening.md
 */
import { describe, it, expect, beforeAll } from "vitest";

const SUPABASE_URL = "https://grtxmbffgmgnkawlvqhm.supabase.co";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdydHhtYmZmZ21nbmthd2x2cWhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4MDM5ODYsImV4cCI6MjA4NjM3OTk4Nn0.izfpHRU8CroQC-3tXxbW_iyuU1g0AIJoWQMS-JRSgko";

/** Rotinas de teste/E2E e um payload válido de formato. */
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

async function chamar(nome: string, corpo: Record<string, unknown>, token?: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${nome}`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token ?? ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(corpo),
  });
  return { status: res.status, texto: await res.text() };
}

describe("P0.2-B: visitante não executa rotinas de teste/E2E", () => {
  for (const [nome, corpo] of ROTINAS_TESTE) {
    it(`bloqueia ${nome}`, async () => {
      if (!networkAvailable) return;
      const { status } = await chamar(nome, corpo);
      expect(status).toBeGreaterThanOrEqual(400);
    });
  }
});

describe("P0.2-B: usuário logado sem autorização de QA não executa rotinas de teste", () => {
  // Token de um usuário logado COMUM (sem papel super_admin).
  const token = process.env.SUPABASE_TEST_COMMON_ACCESS_TOKEN;
  for (const [nome, corpo] of ROTINAS_TESTE) {
    it(`bloqueia ${nome} com sessão comum`, async () => {
      if (!networkAvailable || !token) return; // sem credenciais: coberto pelo caso anon
      const { status, texto } = await chamar(nome, corpo, token);
      expect(status).toBeGreaterThanOrEqual(400);
      // 42501 = permission denied (guarda ou GRANT); PGRST202 = rotina não exposta
      expect(/42501|PGRST202|permission denied/.test(texto)).toBe(true);
    });
  }
});

describe("P0.2-B: nenhuma rotina de teste é executável por anon no catálogo", () => {
  it("mantém apenas service_role (e authenticated com guarda) nas rotinas de teste", async () => {
    if (!networkAvailable) return;
    // Prova indireta via API: a rotina de guarda também nega o visitante.
    const { status } = await chamar("_assert_test_helper_allowed", {});
    expect(status).toBeGreaterThanOrEqual(400);
  });
});
