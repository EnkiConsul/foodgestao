/**
 * Testes property-based (fast-check) dos relatórios contábeis.
 *
 * Em vez de fixar um cenário, geramos milhares de datasets aleatórios e
 * verificamos invariantes que devem valer SEMPRE:
 *  - cascata da DRE fecha e é homogênea (escala linear);
 *  - período: partição em subintervalos soma o total do intervalo;
 *  - regime: caixa == competência quando tudo foi pago na data de vencimento;
 *  - include_zero: superconjunto que não altera nenhum saldo;
 *  - consolidação hierárquica: pai == própria + descendentes.
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { computeDreTotais, NATURE_ROOT, type DreNodeLike } from "@/lib/relatorios/dre";
import {
  mirrorReport,
  type MirrorAccount,
  type MirrorTransaction,
} from "@/lib/relatorios/reportRpcMirror";

const RUNS = 300;
const NATURES = Object.keys(NATURE_ROOT); // receita, custo, despesa_operacional, ...
const cents = (n: number) => Math.round(n * 100) / 100;
const near = (a: number, b: number, tol = 0.05) => Math.abs(a - b) <= tol;

/* -------------------------------------------------------------------------- */
/* Arbitraries                                                                */
/* -------------------------------------------------------------------------- */

/** Saldo bruto: entradas positivas, saídas negativas, valores "de negócio". */
const arbSaldo = fc
  .double({ min: -5_000_000, max: 5_000_000, noNaN: true, noDefaultInfinity: true })
  .map(cents);

/** Nó do relatório, podendo ser raiz (level 1) ou filho (ignorado nos totais). */
const arbNode: fc.Arbitrary<DreNodeLike> = fc.record({
  level: fc.integer({ min: 1, max: 3 }),
  nature: fc.constantFrom(...NATURES),
  saldo_consolidado: arbSaldo,
});

/** Conjunto de nós com sinais coerentes (receita +, demais −). */
const arbNodes = fc.array(arbNode, { minLength: 1, maxLength: 40 }).map((ns) =>
  ns.map((n) => ({
    ...n,
    saldo_consolidado:
      n.nature === "receita"
        ? Math.abs(n.saldo_consolidado ?? 0)
        : -Math.abs(n.saldo_consolidado ?? 0),
  }))
);

/** Plano de contas fixo: 2 raízes × 2 sintéticas × 2 analíticas. */
const ACCOUNTS: MirrorAccount[] = (() => {
  const list: MirrorAccount[] = [];
  for (const root of ["4", "5"]) {
    list.push({ id: `a-${root}`, code: root, name: `Raiz ${root}` });
    for (const s of [1, 2]) {
      list.push({ id: `a-${root}.${s}`, code: `${root}.${s}`, name: `Grupo ${root}.${s}` });
      for (const a of [1, 2]) {
        list.push({
          id: `a-${root}.${s}.${a}`,
          code: `${root}.${s}.${a}`,
          name: `Conta ${root}.${s}.${a}`,
        });
      }
    }
  }
  return list;
})();

const ANALYTIC_IDS = ACCOUNTS.filter((a) => a.code.split(".").length === 3).map((a) => a.id);

const arbDay = fc.integer({ min: 1, max: 28 }).map((d) => String(d).padStart(2, "0"));
const arbMonth = fc.integer({ min: 1, max: 12 }).map((m) => String(m).padStart(2, "0"));
const arbDate = fc.tuple(arbMonth, arbDay).map(([m, d]) => `2026-${m}-${d}`);

const arbTx: fc.Arbitrary<MirrorTransaction> = fc
  .record({
    account_id: fc.constantFrom(...ANALYTIC_IDS),
    transaction_type: fc.constantFrom("entrada", "saida", "transferencia", "parcelamento"),
    status: fc.constantFrom("confirmado", "pendente", "cancelado"),
    amount: fc.double({ min: 0, max: 500_000, noNaN: true, noDefaultInfinity: true }).map(cents),
    due: arbDate,
    paidRatio: fc.constantFrom(0, 0.5, 1),
    hasPaymentDate: fc.boolean(),
  })
  .map((r) => ({
    account_id: r.account_id,
    transaction_type: r.transaction_type,
    status: r.status,
    amount: r.amount,
    amount_paid: cents(r.amount * r.paidRatio),
    due_date: r.due,
    transaction_date: r.due,
    payment_date: r.hasPaymentDate ? r.due : null,
  }));

const arbTxs = fc.array(arbTx, { minLength: 0, maxLength: 120 });

/** Lançamentos totalmente liquidados na data de vencimento. */
const arbSettledTxs = arbTxs.map((txs) =>
  txs.map((t) => ({ ...t, amount_paid: t.amount, payment_date: t.due_date }))
);

const YEAR = { from: "2026-01-01", to: "2026-12-31" };

const totalOf = (rows: Array<{ code: string; saldo_proprio: number }>) =>
  cents(rows.reduce((s, r) => s + r.saldo_proprio, 0));

/* -------------------------------------------------------------------------- */
/* DRE                                                                        */
/* -------------------------------------------------------------------------- */

describe("property-based: invariantes da DRE", () => {
  it("a cascata fecha: resultado = receita - impostos - custos - despOp - despFin", () => {
    fc.assert(
      fc.property(arbNodes, (nodes) => {
        const t = computeDreTotais(nodes);
        expect(
          near(t.resultado, t.receita - t.impostos - t.custos - t.despOp - t.despFin, 0.01)
        ).toBe(true);
        expect(near(t.receita_liquida, t.receita - t.impostos, 0.01)).toBe(true);
        expect(near(t.lucro_bruto, t.receita_liquida - t.custos, 0.01)).toBe(true);
        expect(near(t.ebitda, t.lucro_bruto - t.despOp, 0.01)).toBe(true);
      }),
      { numRuns: RUNS }
    );
  });

  it("todos os totais são sempre finitos", () => {
    fc.assert(
      fc.property(arbNodes, (nodes) => {
        for (const v of Object.values(computeDreTotais(nodes))) {
          expect(Number.isFinite(v)).toBe(true);
        }
      }),
      { numRuns: RUNS }
    );
  });

  it("custos, despesas e impostos nunca ficam negativos quando o saldo é de saída", () => {
    fc.assert(
      fc.property(arbNodes, (nodes) => {
        const t = computeDreTotais(nodes);
        expect(t.custos).toBeGreaterThanOrEqual(-0.01);
        expect(t.despOp).toBeGreaterThanOrEqual(-0.01);
        expect(t.despFin).toBeGreaterThanOrEqual(-0.01);
        expect(t.impostos).toBeGreaterThanOrEqual(-0.01);
        expect(t.receita).toBeGreaterThanOrEqual(-0.01);
      }),
      { numRuns: RUNS }
    );
  });

  it("é homogênea: escalar todos os saldos por k escala os totais por k e preserva margens", () => {
    fc.assert(
      fc.property(arbNodes, fc.integer({ min: 2, max: 1000 }), (nodes, k) => {
        const base = computeDreTotais(nodes);
        const scaled = computeDreTotais(
          nodes.map((n) => ({ ...n, saldo_consolidado: (n.saldo_consolidado ?? 0) * k }))
        );
        const tol = Math.max(0.02, Math.abs(base.resultado) * k * 1e-9);
        expect(near(scaled.resultado, base.resultado * k, tol)).toBe(true);
        expect(near(scaled.receita_liquida, base.receita_liquida * k, tol)).toBe(true);
        if (Math.abs(base.receita_liquida) > 1) {
          expect(near(scaled.mLiquida, base.mLiquida, 0.01)).toBe(true);
          expect(near(scaled.mBruta, base.mBruta, 0.01)).toBe(true);
        }
      }),
      { numRuns: RUNS }
    );
  });

  it("independe da ordem dos nós e ignora nós de saldo zero", () => {
    fc.assert(
      fc.property(arbNodes, fc.constantFrom(...NATURES), (nodes, nature) => {
        const base = computeDreTotais(nodes);
        const shuffled = computeDreTotais([...nodes].reverse());
        expect(near(shuffled.resultado, base.resultado, 0.01)).toBe(true);

        const withZero = computeDreTotais([
          ...nodes,
          { level: 1, nature, saldo_consolidado: 0 },
          { level: 1, nature, saldo_consolidado: null },
        ]);
        expect(near(withZero.resultado, base.resultado, 0.01)).toBe(true);
      }),
      { numRuns: RUNS }
    );
  });

  it("nós de nível > 1 nunca entram nos totais (sem dupla contagem)", () => {
    fc.assert(
      fc.property(arbNodes, (nodes) => {
        const roots = nodes.filter((n) => n.level === 1);
        expect(near(computeDreTotais(nodes).resultado, computeDreTotais(roots).resultado, 0.01)).toBe(
          true
        );
      }),
      { numRuns: RUNS }
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Filtros                                                                     */
/* -------------------------------------------------------------------------- */

describe("property-based: invariantes do filtro de período", () => {
  it("particionar o ano em 12 meses soma exatamente o total do ano", () => {
    fc.assert(
      fc.property(arbTxs, (txs) => {
        const yearTotal = totalOf(
          mirrorReport(ACCOUNTS, txs, { ...YEAR, regime: "competencia", include_zero: true })
        );
        let sum = 0;
        for (let m = 1; m <= 12; m++) {
          const mm = String(m).padStart(2, "0");
          sum += totalOf(
            mirrorReport(ACCOUNTS, txs, {
              from: `2026-${mm}-01`,
              to: `2026-${mm}-31`,
              regime: "competencia",
              include_zero: true,
            })
          );
        }
        expect(near(sum, yearTotal, 0.5)).toBe(true);
      }),
      { numRuns: 120 }
    );
  });

  it("intervalo vazio (fora do ano) não produz movimento", () => {
    fc.assert(
      fc.property(arbTxs, (txs) => {
        const rows = mirrorReport(ACCOUNTS, txs, {
          from: "2030-01-01",
          to: "2030-12-31",
          regime: "competencia",
        });
        expect(rows.length).toBe(0);
      }),
      { numRuns: 120 }
    );
  });

  it("intervalo mais amplo nunca reduz o valor absoluto movimentado", () => {
    fc.assert(
      fc.property(arbTxs, arbMonth, (txs, mm) => {
        const abs = (f: string, t: string) =>
          mirrorReport(ACCOUNTS, txs, { from: f, to: t, regime: "competencia", include_zero: true })
            .filter((r) => r.code.split(".").length === 3)
            .reduce((s, r) => s + Math.abs(r.debitos) + Math.abs(r.creditos), 0);
        const month = abs(`2026-${mm}-01`, `2026-${mm}-31`);
        const year = abs(YEAR.from, YEAR.to);
        expect(year + 0.5).toBeGreaterThanOrEqual(month);
      }),
      { numRuns: 120 }
    );
  });
});

describe("property-based: invariantes do regime", () => {
  it("caixa == competência quando tudo é pago integralmente no vencimento", () => {
    fc.assert(
      fc.property(arbSettledTxs, (txs) => {
        const comp = mirrorReport(ACCOUNTS, txs, { ...YEAR, regime: "competencia", include_zero: true });
        const caixa = mirrorReport(ACCOUNTS, txs, { ...YEAR, regime: "caixa", include_zero: true });
        expect(near(totalOf(comp), totalOf(caixa), 0.5)).toBe(true);
      }),
      { numRuns: 150 }
    );
  });

  it("caixa ignora lançamentos sem data de pagamento ou sem valor pago", () => {
    fc.assert(
      fc.property(arbTxs, (txs) => {
        const semCaixa = txs.map((t) => ({ ...t, payment_date: null }));
        const rows = mirrorReport(ACCOUNTS, semCaixa, { ...YEAR, regime: "caixa" });
        expect(rows.length).toBe(0);
      }),
      { numRuns: 120 }
    );
  });

  it("lançamentos cancelados ou de transferência/parcelamento não afetam nenhum regime", () => {
    fc.assert(
      fc.property(arbTxs, arbTxs, (base, noise) => {
        const ruido = noise.map((t, i) =>
          i % 2 === 0
            ? { ...t, status: "cancelado" }
            : { ...t, status: "confirmado", transaction_type: "transferencia" }
        );
        for (const regime of ["competencia", "caixa"] as const) {
          const a = totalOf(mirrorReport(ACCOUNTS, base, { ...YEAR, regime, include_zero: true }));
          const b = totalOf(
            mirrorReport(ACCOUNTS, [...base, ...ruido], { ...YEAR, regime, include_zero: true })
          );
          expect(near(a, b, 0.5)).toBe(true);
        }
      }),
      { numRuns: 120 }
    );
  });
});

describe("property-based: invariantes de include_zero e consolidação", () => {
  it("include_zero é superconjunto e não altera nenhum saldo", () => {
    fc.assert(
      fc.property(arbTxs, fc.constantFrom("competencia", "caixa" as const), (txs, regime) => {
        const off = mirrorReport(ACCOUNTS, txs, { ...YEAR, regime: regime as any });
        const on = mirrorReport(ACCOUNTS, txs, {
          ...YEAR,
          regime: regime as any,
          include_zero: true,
        });
        expect(on.length).toBeGreaterThanOrEqual(off.length);
        expect(on.length).toBe(ACCOUNTS.length);

        const byCode = new Map(on.map((r) => [r.code, r]));
        for (const r of off) {
          const same = byCode.get(r.code)!;
          expect(same.saldo_proprio).toBe(r.saldo_proprio);
          expect(same.saldo_consolidado).toBe(r.saldo_consolidado);
          expect(r.has_movement).toBe(true);
        }
      }),
      { numRuns: 150 }
    );
  });

  it("consolidado do pai = próprio + soma dos consolidados dos filhos diretos", () => {
    fc.assert(
      fc.property(arbTxs, (txs) => {
        const rows = mirrorReport(ACCOUNTS, txs, { ...YEAR, regime: "competencia", include_zero: true });
        const byCode = new Map(rows.map((r) => [r.code, r]));
        for (const r of rows) {
          const filhos = rows.filter(
            (c) =>
              c.code.startsWith(r.code + ".") &&
              c.code.split(".").length === r.code.split(".").length + 1
          );
          if (filhos.length === 0) continue;
          const esperado =
            byCode.get(r.code)!.saldo_proprio +
            filhos.reduce((s, c) => s + c.saldo_consolidado, 0);
          expect(near(r.saldo_consolidado, esperado, 0.5)).toBe(true);
        }
      }),
      { numRuns: 150 }
    );
  });

  it("saída sempre ordenada por código e sem duplicatas", () => {
    fc.assert(
      fc.property(arbTxs, fc.boolean(), (txs, includeZero) => {
        const rows = mirrorReport(ACCOUNTS, txs, {
          ...YEAR,
          regime: "competencia",
          include_zero: includeZero,
        });
        const codes = rows.map((r) => r.code);
        expect(new Set(codes).size).toBe(codes.length);
        expect(codes).toEqual([...codes].sort((a, b) => a.localeCompare(b)));
        for (const r of rows) {
          expect(Number.isFinite(r.saldo_consolidado)).toBe(true);
          expect(near(r.saldo_proprio, cents(r.creditos - r.debitos), 0.02)).toBe(true);
        }
      }),
      { numRuns: 150 }
    );
  });
});
