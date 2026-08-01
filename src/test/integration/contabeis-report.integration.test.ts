/**
 * Testes de integração — paridade entre a query do backend (RPC
 * `chart_accounts_report`) e o cálculo do relatório no front-end.
 *
 * Para cada combinação de filtros (período × regime × incluir contas sem
 * movimento) comparamos, conta por conta, os totais devolvidos pelo banco com
 * os recalculados localmente a partir dos lançamentos crus (espelho puro em
 * `reportRpcMirror.ts`). Qualquer divergência de regime, recorte de data ou
 * consolidação de hierarquia falha aqui.
 *
 * Roda apenas com credenciais de teste; sem elas o bloco é pulado.
 *
 *   TEST_SUPABASE_URL=... TEST_SUPABASE_ANON_KEY=... \
 *   TEST_USER_A_EMAIL=... TEST_USER_A_PASSWORD=... \
 *   TEST_CONTEXT=pj TEST_COMPANY_1_ID=... \
 *   bunx vitest run src/test/integration/contabeis-report.integration.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { rangeForPreset, type Preset, type Regime } from "@/lib/relatorios/reportFilters";
import {
  mirrorReport,
  type MirrorAccount,
  type MirrorTransaction,
} from "@/lib/relatorios/reportRpcMirror";

const URL = process.env.TEST_SUPABASE_URL;
const ANON = process.env.TEST_SUPABASE_ANON_KEY;
const EMAIL = process.env.TEST_USER_A_EMAIL;
const PASSWORD = process.env.TEST_USER_A_PASSWORD;
const CONTEXT = (process.env.TEST_CONTEXT ?? "pj") as "pf" | "pj";
const COMPANY_ID = process.env.TEST_COMPANY_1_ID ?? null;

const configured =
  !!URL && !!ANON && !!EMAIL && !!PASSWORD && (CONTEXT === "pf" || !!COMPANY_ID);

const PRESETS: Preset[] = ["month", "prev_month", "quarter", "year", "12m"];
const REGIMES: Regime[] = ["competencia", "caixa"];

interface RpcRow {
  code: string;
  name: string;
  debitos: number;
  creditos: number;
  saldo_proprio: number;
  saldo_consolidado: number;
  has_movement: boolean;
}

(configured ? describe : describe.skip)(
  "Integração: chart_accounts_report x cálculo do front-end",
  () => {
    let client: SupabaseClient;
    let accounts: MirrorAccount[] = [];
    let transactions: MirrorTransaction[] = [];

    beforeAll(async () => {
      client = createClient(URL!, ANON!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error: authError } = await client.auth.signInWithPassword({
        email: EMAIL!,
        password: PASSWORD!,
      });
      if (authError) throw authError;

      // Plano de contas visível no contexto/empresa do teste.
      let accQuery = client
        .from("chart_accounts")
        .select(
          CONTEXT === "pj"
            ? "id, code, name, context, chart_account_companies!inner(company_id)"
            : "id, code, name, context"
        )
        .eq("context", CONTEXT)
        .not("code", "is", null);
      if (CONTEXT === "pj") {
        accQuery = accQuery.eq("chart_account_companies.company_id", COMPANY_ID!);
      }
      const { data: accData, error: accError } = await accQuery;
      if (accError) throw accError;
      accounts = (accData ?? []).map((a: any) => ({
        id: a.id,
        code: a.code,
        name: a.name,
      }));

      // Lançamentos crus com a conta contábil derivada da categoria.
      let txQuery = client
        .from("transactions")
        .select(
          "id, transaction_type, status, amount, amount_paid, due_date, transaction_date, payment_date, cost_center_id, context, company_id, categories!inner(chart_account_id)"
        )
        .eq("context", CONTEXT)
        .in("transaction_type", ["entrada", "saida"])
        .not("categories.chart_account_id", "is", null);
      if (CONTEXT === "pj") txQuery = txQuery.eq("company_id", COMPANY_ID!);

      const page = 1000;
      let offset = 0;
      const all: any[] = [];
      for (;;) {
        const { data, error } = await txQuery.range(offset, offset + page - 1);
        if (error) throw error;
        all.push(...(data ?? []));
        if ((data?.length ?? 0) < page) break;
        offset += page;
      }

      transactions = all.map((t: any) => ({
        account_id: t.categories?.chart_account_id ?? null,
        transaction_type: t.transaction_type,
        status: t.status,
        amount: t.amount,
        amount_paid: t.amount_paid,
        due_date: t.due_date,
        transaction_date: t.transaction_date,
        payment_date: t.payment_date,
        cost_center_id: t.cost_center_id,
      }));
    }, 60_000);

    const callRpc = async (
      from: string,
      to: string,
      regime: Regime,
      includeZero: boolean
    ): Promise<RpcRow[]> => {
      const { data, error } = await client.rpc("chart_accounts_report" as never, {
        _context: CONTEXT,
        _company_id: CONTEXT === "pj" ? COMPANY_ID : null,
        _from: from,
        _to: to,
        _regime: regime,
        _cost_center_ids: null,
        _include_zero: includeZero,
      } as never);
      if (error) throw error;
      return (data ?? []) as unknown as RpcRow[];
    };

    it("o ambiente de teste expõe plano de contas e lançamentos", () => {
      expect(accounts.length).toBeGreaterThan(0);
      expect(transactions.length).toBeGreaterThan(0);
    });

    for (const preset of PRESETS) {
      for (const regime of REGIMES) {
        for (const includeZero of [false, true]) {
          it(`preset=${preset} regime=${regime} include_zero=${includeZero}: totais idênticos`, async () => {
            const { from, to } = rangeForPreset(preset, { from: "", to: "" });
            const rpc = await callRpc(from, to, regime, includeZero);
            const local = mirrorReport(accounts, transactions, {
              from,
              to,
              regime,
              include_zero: includeZero,
            });

            expect(local.map((r) => r.code)).toEqual(rpc.map((r) => r.code));

            const byCode = new Map(local.map((r) => [r.code, r]));
            for (const row of rpc) {
              const mine = byCode.get(row.code)!;
              expect(Number(row.creditos)).toBeCloseTo(mine.creditos, 2);
              expect(Number(row.debitos)).toBeCloseTo(mine.debitos, 2);
              expect(Number(row.saldo_proprio)).toBeCloseTo(mine.saldo_proprio, 2);
              expect(Number(row.saldo_consolidado)).toBeCloseTo(
                mine.saldo_consolidado,
                2
              );
              expect(row.has_movement).toBe(mine.has_movement);
            }
          }, 60_000);
        }
      }
    }

    it("regime caixa nunca excede competência no total de débitos do ano", async () => {
      const { from, to } = rangeForPreset("year", { from: "", to: "" });
      const comp = await callRpc(from, to, "competencia", false);
      const caixa = await callRpc(from, to, "caixa", false);
      const sum = (rows: RpcRow[]) =>
        rows
          .filter((r) => r.code.split(".").length === 1)
          .reduce((s, r) => s + Number(r.debitos), 0);
      expect(sum(caixa)).toBeLessThanOrEqual(sum(comp) + 0.001);
    }, 60_000);

    it("include_zero não altera os valores das contas com movimento", async () => {
      const { from, to } = rangeForPreset("year", { from: "", to: "" });
      const sem = await callRpc(from, to, "competencia", false);
      const com = await callRpc(from, to, "competencia", true);
      const byCode = new Map(com.map((r) => [r.code, r]));
      for (const r of sem) {
        expect(Number(byCode.get(r.code)!.saldo_consolidado)).toBeCloseTo(
          Number(r.saldo_consolidado),
          2
        );
      }
      expect(com.length).toBeGreaterThanOrEqual(sem.length);
    }, 60_000);
  }
);
