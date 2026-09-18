/**
 * P0 — Segurança: visitante anônimo não alcança dados financeiros.
 *
 * Cobre, com a chave publicável (anon) e sem sessão:
 *  1. Leitura bloqueada nas tabelas financeiras sensíveis.
 *  2. Escrita bloqueada nas mesmas tabelas.
 *  3. Realtime: a inscrição não entrega linha alguma (RLS + grants fechados).
 *  4. Nenhuma rotina interna (SECURITY DEFINER) financeira/operacional pode
 *     ser executada por anon.
 *
 * Roda sem credenciais: usa apenas a chave publicável.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.TEST_SUPABASE_URL!;
const ANON_KEY = process.env.TEST_SUPABASE_ANON_KEY!;

const TABELAS_FINANCEIRAS = [
  "accounts",
  "transactions",
  "credit_cards",
  "credit_card_invoices",
  "pluggy_connections",
  "pluggy_accounts",
  "pluggy_v2_connections",
  "pluggy_v2_accounts",
  "pluggy_v2_sync_runs",
  "pluggy_v2_transactions_raw",
  "invoices",
  "subscriptions",
] as const;

/** Rotinas internas que já foram revogadas de anon nesta fase. */
const RPCS_REVOGADAS = [
  "credit_card_other_company",
  "purge_open_finance_link",
  "pluggy_mark_duplicate_staging",
  "insert_audit_log",
  "is_company_admin_or_owner",
  "dp_folga_marcar",
  "dp_solicitacao_criar",
] as const;

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
    realtime: { params: { eventsPerSecond: 1 } },
  });

describe("anon não lê dados financeiros", () => {
  for (const tabela of TABELAS_FINANCEIRAS) {
    it(`bloqueia SELECT anônimo em ${tabela}`, async () => {
      if (!networkAvailable) throw new Error('Backend de homologação indisponível; teste não executado.');
      const { data, error } = await anon()
        .from(tabela)
        .select("id")
        .limit(1);
      // Fail closed: ou erro de permissão, ou zero linhas.
      expect(error != null || (data?.length ?? 0) === 0).toBe(true);
    });
  }
});

describe("anon não escreve dados financeiros", () => {
  for (const tabela of TABELAS_FINANCEIRAS) {
    it(`bloqueia INSERT anônimo em ${tabela}`, async () => {
      if (!networkAvailable) throw new Error('Backend de homologação indisponível; teste não executado.');
      const { data, error } = await anon()
        .from(tabela)
        .insert({} as never)
        .select();
      expect(error != null || (data?.length ?? 0) === 0).toBe(true);
    });
  }
});

describe("anon não executa rotinas internas", () => {
  for (const rpc of RPCS_REVOGADAS) {
    it(`bloqueia execução anônima de ${rpc}`, async () => {
      if (!networkAvailable) throw new Error('Backend de homologação indisponível; teste não executado.');
      const { error } = await anon().rpc(rpc as never, {} as never);
      expect(error).toBeTruthy();
    });
  }
});

describe("Realtime não entrega dados financeiros para anon", () => {
  it("inscrição anônima em accounts/transactions não recebe linhas", async () => {
    if (!networkAvailable) throw new Error('Backend de homologação indisponível; teste não executado.');
    const client = anon();
    const recebidos: unknown[] = [];

    const canal = client
      .channel("p0-anon-financeiro")
      .on("postgres_changes", { event: "*", schema: "public", table: "accounts" }, (p) =>
        recebidos.push(p)
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, (p) =>
        recebidos.push(p)
      );

    const estado = await new Promise<string>((resolve) => {
      const timer = setTimeout(() => resolve("TIMED_OUT"), 8000);
      canal.subscribe((status) => {
        if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          clearTimeout(timer);
          resolve(status);
        }
      });
    });

    // Mesmo que o canal conecte, nenhuma linha financeira pode chegar.
    await new Promise((r) => setTimeout(r, 1500));
    await client.removeChannel(canal);

    expect(["SUBSCRIBED", "CHANNEL_ERROR", "TIMED_OUT"]).toContain(estado);
    expect(recebidos).toHaveLength(0);
  }, 20000);
});
