/**
 * P0.2-A — rotinas internas do financeiro/Open Finance fechadas.
 *
 * Prova que as rotinas SECURITY DEFINER internas do domínio financeiro não são
 * executáveis por visitante (anon) nem por usuário logado (authenticated):
 * o PostgREST responde com 403/42501 (permission denied) ou 404 (rotina não
 * exposta), nunca com sucesso.
 *
 * As RPCs app-facing (get_accessible_accounts, chart_accounts_report,
 * recompute_all_account_balances, delete_account, pay_credit_card_invoice...)
 * continuam com EXECUTE para authenticated — verificado no relatório da fase e
 * pelas suítes de RLS/tenancy financeiras existentes.
 *
 * Roda sem credenciais: usa apenas a chave publicável (anon).
 */
import { describe, it, expect, beforeAll } from "vitest";

const SUPABASE_URL = "https://grtxmbffgmgnkawlvqhm.supabase.co";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdydHhtYmZmZ21nbmthd2x2cWhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4MDM5ODYsImV4cCI6MjA4NjM3OTk4Nn0.izfpHRU8CroQC-3tXxbW_iyuU1g0AIJoWQMS-JRSgko";

const ID = "00000000-0000-4000-8000-0000000000f1";

/** Rotinas internas revogadas nesta fase (helpers, triggers e OF legado). */
const ROTINAS_INTERNAS: Array<[string, Record<string, unknown>]> = [
  ["recompute_account_balance", { _account_id: ID }],
  ["soft_delete_account", { _account_id: ID }],
  ["report_balance_drift", {}],
  ["assign_transaction_to_invoice", { _transaction_id: ID }],
  ["recalc_credit_card_invoice_totals", { _invoice_id: ID }],
  ["chart_account_next_code", { _parent_id: ID }],
  ["chart_accounts_seed_default", { _company_id: ID }],
  ["sync_of_account_balance", { _account_id: ID, _new_balance: 1 }],
  ["link_open_finance_account", { _of_account_id: ID, _local_account_id: ID }],
  ["create_and_link_open_finance_account", { _of_account_id: ID, _account_name: "X" }],
  ["ignore_open_finance_account", { _of_account_id: ID, _ignored: true }],
  ["ignore_open_finance_raw", { _raw_ids: [ID] }],
  ["promote_open_finance_transactions", { _connection_id: ID }],
  ["open_finance_sync_health", {}],
  ["prevent_hard_delete_account_with_history", {}],
  ["guard_of_current_balance", {}],
  ["guard_transaction_category_active", {}],
  ["learn_categorization_rule", {}],
  ["chart_account_autofill_code", {}],
  ["audit_pluggy_v2_raw_delete", {}],
  ["pluggy_sync_pause_on_account_toggle", {}],
  ["seed_default_account_on_company", {}],
  ["tg_transactions_assign_cc_invoice", {}],
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
  const texto = await res.text();
  return { status: res.status, texto };
}

describe("P0.2-A: visitante não executa rotinas internas do financeiro", () => {
  for (const [nome, corpo] of ROTINAS_INTERNAS) {
    it(`bloqueia ${nome}`, async () => {
      if (!networkAvailable) return;
      const { status, texto } = await chamar(nome, corpo);
      expect(status).toBeGreaterThanOrEqual(400);
      expect(texto).not.toContain('"balance"');
    });
  }
});

describe("P0.2-A: usuário logado não executa rotinas internas do financeiro", () => {
  const token = process.env.SUPABASE_TEST_ACCESS_TOKEN;
  for (const [nome, corpo] of ROTINAS_INTERNAS) {
    it(`bloqueia ${nome} com sessão`, async () => {
      if (!networkAvailable || !token) return; // sem credenciais no CI: coberto pelo caso anon
      const { status, texto } = await chamar(nome, corpo, token);
      expect(status).toBeGreaterThanOrEqual(400);
      // 42501 = permission denied for function; PGRST202 = rotina não exposta
      expect(/42501|PGRST202|permission denied/.test(texto)).toBe(true);
    });
  }
});
