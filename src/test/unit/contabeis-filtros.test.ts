import { describe, it, expect } from "vitest";
import {
  rangeForPreset,
  aggregateReport,
  effectiveEntry,
  type ReportTransaction,
  type ReportAccount,
} from "@/lib/relatorios/reportFilters";

/**
 * Fixture real (Raptor Systems, jul–set/2026), reduzida.
 * Inclui o lançamento pendente de 01/08 (R$ 80,00 sem pagamento),
 * que é justamente a diferença entre Competência e Caixa.
 */
const ACCOUNTS: ReportAccount[] = [
  { code: "3.1", name: "Receita Comissão RedFox" },
  { code: "3.2", name: "Receita Comissão SuitPay" },
  { code: "4.1", name: "Custos Diversos" },
  { code: "5.1", name: "Despesas Diversas" },
  { code: "5.2", name: "Lazer" },
  { code: "5.9", name: "Conta sem movimento" },
];

const TX: ReportTransaction[] = [
  { account_code: "3.1", transaction_type: "entrada", amount: 402.64, amount_paid: 402.64, due_date: "2026-07-06", payment_date: "2026-07-06" },
  { account_code: "3.1", transaction_type: "entrada", amount: 1000, amount_paid: 1000, due_date: "2026-07-13", payment_date: "2026-07-13" },
  { account_code: "3.1", transaction_type: "entrada", amount: 660, amount_paid: 660, due_date: "2026-07-15", payment_date: "2026-07-15" },
  { account_code: "3.2", transaction_type: "entrada", amount: 195, amount_paid: 195, due_date: "2026-07-08", payment_date: "2026-07-08" },
  { account_code: "3.2", transaction_type: "entrada", amount: 265, amount_paid: 265, due_date: "2026-07-08", payment_date: "2026-07-08" },
  { account_code: "4.1", transaction_type: "saida", amount: 129.65, amount_paid: 129.65, due_date: "2026-07-14", payment_date: "2026-07-14" },
  { account_code: "4.1", transaction_type: "saida", amount: 145, amount_paid: 145, due_date: "2026-07-15", payment_date: "2026-07-15" },
  { account_code: "5.1", transaction_type: "saida", amount: 233.15, amount_paid: 233.15, due_date: "2026-07-07", payment_date: "2026-07-07" },
  { account_code: "5.2", transaction_type: "saida", amount: 60, amount_paid: 60, due_date: "2026-07-06", payment_date: "2026-07-06" },
  // Pendente: entra em competência (ago), some no caixa
  { account_code: "5.2", transaction_type: "saida", amount: 80, amount_paid: 0, due_date: "2026-08-01", payment_date: null },
];

const JUL = { from: "2026-07-01", to: "2026-07-31" };
const TRI = { from: "2026-07-01", to: "2026-09-30" };

describe("filtro de Período", () => {
  const now = new Date(2026, 6, 15); // 15/07/2026

  it("mês atual", () => {
    expect(rangeForPreset("month", JUL, now)).toEqual({ from: "2026-07-01", to: "2026-07-31" });
  });

  it("mês anterior", () => {
    expect(rangeForPreset("prev_month", JUL, now)).toEqual({ from: "2026-06-01", to: "2026-06-30" });
  });

  it("trimestre e ano", () => {
    expect(rangeForPreset("quarter", JUL, now)).toEqual({ from: "2026-07-01", to: "2026-09-30" });
    expect(rangeForPreset("year", JUL, now)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });

  it("12 meses cobre 12 meses cheios terminando no mês atual", () => {
    expect(rangeForPreset("12m", JUL, now)).toEqual({ from: "2025-08-01", to: "2026-07-31" });
  });

  it("custom preserva o intervalo escolhido pelo usuário", () => {
    expect(rangeForPreset("custom", { from: "2026-03-10", to: "2026-04-02" }, now)).toEqual({
      from: "2026-03-10",
      to: "2026-04-02",
    });
  });

  it("restringir o período reduz os totais (julho vs trimestre)", () => {
    const jul = aggregateReport(ACCOUNTS, TX, { ...JUL, regime: "competencia" });
    const tri = aggregateReport(ACCOUNTS, TX, { ...TRI, regime: "competencia" });

    const lazerJul = jul.find((r) => r.code === "5.2")!;
    const lazerTri = tri.find((r) => r.code === "5.2")!;
    expect(lazerJul.debitos).toBe(60);
    expect(lazerTri.debitos).toBe(140); // 60 + 80 (ago)
  });

  it("período sem lançamentos retorna vazio (sem include_zero)", () => {
    const out = aggregateReport(ACCOUNTS, TX, {
      from: "2026-10-01",
      to: "2026-10-31",
      regime: "competencia",
    });
    expect(out).toHaveLength(0);
  });
});

describe("filtro Incluir contas sem movimento", () => {
  it("desligado exibe apenas contas movimentadas", () => {
    const out = aggregateReport(ACCOUNTS, TX, { ...JUL, regime: "competencia" });
    expect(out.map((r) => r.code)).toEqual(["3.1", "3.2", "4.1", "5.1", "5.2"]);
    expect(out.every((r) => r.has_movement)).toBe(true);
  });

  it("ligado exibe o plano completo, inclusive zeradas", () => {
    const out = aggregateReport(ACCOUNTS, TX, { ...JUL, regime: "competencia", include_zero: true });
    expect(out).toHaveLength(ACCOUNTS.length);
    const vazia = out.find((r) => r.code === "5.9")!;
    expect(vazia.has_movement).toBe(false);
    expect(vazia.saldo).toBe(0);
  });

  it("não altera os valores das contas com movimento", () => {
    const sem = aggregateReport(ACCOUNTS, TX, { ...JUL, regime: "competencia" });
    const com = aggregateReport(ACCOUNTS, TX, { ...JUL, regime: "competencia", include_zero: true });
    for (const r of sem) {
      expect(com.find((x) => x.code === r.code)!.saldo).toBe(r.saldo);
    }
  });
});

describe("filtro de Regime (Competência vs Caixa)", () => {
  it("competência usa vencimento e valor total", () => {
    expect(
      effectiveEntry(
        { account_code: "5.2", transaction_type: "saida", amount: 80, amount_paid: 0, due_date: "2026-08-01", payment_date: null },
        "competencia"
      )
    ).toEqual({ date: "2026-08-01", value: 80 });
  });

  it("caixa ignora lançamento sem pagamento", () => {
    expect(
      effectiveEntry(
        { account_code: "5.2", transaction_type: "saida", amount: 80, amount_paid: 0, due_date: "2026-08-01", payment_date: null },
        "caixa"
      )
    ).toBeNull();
  });

  it("caixa usa amount_paid e a data de pagamento", () => {
    expect(
      effectiveEntry(
        { account_code: "4.1", transaction_type: "saida", amount: 200, amount_paid: 120, due_date: "2026-07-10", payment_date: "2026-07-20" },
        "caixa"
      )
    ).toEqual({ date: "2026-07-20", value: 120 });
  });

  it("no trimestre a diferença entre regimes é exatamente o pendente de R$ 80", () => {
    const comp = aggregateReport(ACCOUNTS, TX, { ...TRI, regime: "competencia" });
    const caixa = aggregateReport(ACCOUNTS, TX, { ...TRI, regime: "caixa" });

    const desp = (rows: typeof comp) => rows.reduce((s, r) => s + r.debitos, 0);
    expect(desp(comp) - desp(caixa)).toBe(80);

    // Receitas (todas liquidadas) não mudam entre regimes
    const rec = (rows: typeof comp) => rows.reduce((s, r) => s + r.creditos, 0);
    expect(rec(comp)).toBe(rec(caixa));
    expect(rec(comp)).toBe(2522.64);
  });

  it("caixa desloca o lançamento para o mês do pagamento", () => {
    const tx: ReportTransaction[] = [
      { account_code: "4.1", transaction_type: "saida", amount: 500, amount_paid: 500, due_date: "2026-07-30", payment_date: "2026-08-05" },
    ];
    const julComp = aggregateReport(ACCOUNTS, tx, { ...JUL, regime: "competencia" });
    const julCaixa = aggregateReport(ACCOUNTS, tx, { ...JUL, regime: "caixa" });
    expect(julComp.find((r) => r.code === "4.1")?.debitos).toBe(500);
    expect(julCaixa).toHaveLength(0);
  });
});
