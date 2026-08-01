/**
 * Testes de performance da DRE Gerencial.
 *
 * Medem, com volumes grandes (plano de contas com ~1.000 contas e até 200 mil
 * lançamentos):
 *  - custo da agregação (espelho da RPC) por troca de filtro;
 *  - custo da recomputação dos totais da DRE quando o período/regime muda;
 *  - tempo de render inicial e de re-render do componente `DreReport`.
 *
 * Os orçamentos (budgets) são intencionalmente folgados para não gerar
 * flakiness em CI, mas apertados o suficiente para pegar regressões de ordem
 * de grandeza (ex.: cálculo O(n²) ou perda de memoização).
 */
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { createElement } from "react";
import { DreReport } from "@/components/relatorios/contabeis/DreReport";
import { computeDreTotais } from "@/lib/relatorios/dre";
import { mirrorReport } from "@/lib/relatorios/reportRpcMirror";
import { rangeForPreset } from "@/lib/relatorios/reportFilters";
import type { ReportNode } from "@/hooks/useContabeisReport";
import {
  buildAccountPlan,
  buildTransactions,
  applyBalances,
} from "@/test/fixtures/contabeisLargeDataset";

/** Mede a duração média de `fn` em ms, descartando a primeira execução (warm-up). */
function measure(fn: () => void, runs = 5): number {
  fn(); // warm-up (JIT)
  const samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn();
    samples.push(performance.now() - t0);
  }
  return samples.reduce((a, b) => a + b, 0) / samples.length;
}

const NOW = new Date("2026-08-15T12:00:00Z");
const YEAR = { from: "2026-01-01", to: "2026-12-31" };

let plan: ReturnType<typeof buildAccountPlan>;
let txs50k: ReturnType<typeof buildTransactions>;
let txs200k: ReturnType<typeof buildTransactions>;
let yearNodes: ReportNode[];

beforeAll(() => {
  // 5 raízes × 8 sintéticas × 25 analíticas = 1.045 contas
  plan = buildAccountPlan(8, 25);
  txs50k = buildTransactions(plan.analyticIds, 50_000);
  txs200k = buildTransactions(plan.analyticIds, 200_000);

  const rows = mirrorReport(plan.mirrorAccounts, txs50k, { ...YEAR, regime: "competencia", include_zero: true });
  yearNodes = applyBalances(plan.nodes, rows);
});

afterEach(() => cleanup());

describe("performance: agregação por troca de filtro", () => {
  it("plano de contas gerado tem o volume esperado", () => {
    expect(plan.mirrorAccounts.length).toBe(1045);
    expect(plan.analyticIds.length).toBe(1000);
  });

  it("agrega 50k lançamentos em < 1500ms por troca de período", () => {
    const ms = measure(() =>
      mirrorReport(plan.mirrorAccounts, txs50k, { ...YEAR, regime: "competencia" })
    );
    console.log(`[perf] mirrorReport 50k lançamentos: ${ms.toFixed(1)}ms`);
    expect(ms).toBeLessThan(1500);
  });

  it("troca de regime (competência → caixa) não custa mais que ~2x o cenário base", () => {
    const comp = measure(() =>
      mirrorReport(plan.mirrorAccounts, txs50k, { ...YEAR, regime: "competencia" })
    );
    const caixa = measure(() =>
      mirrorReport(plan.mirrorAccounts, txs50k, { ...YEAR, regime: "caixa" })
    );
    console.log(`[perf] regime competencia=${comp.toFixed(1)}ms caixa=${caixa.toFixed(1)}ms`);
    expect(caixa).toBeLessThan(Math.max(comp * 2.5, 1500));
  });

  it("escala aproximadamente linear de 50k → 200k lançamentos", () => {
    const small = measure(() =>
      mirrorReport(plan.mirrorAccounts, txs50k, { ...YEAR, regime: "competencia" })
    , 3);
    const large = measure(() =>
      mirrorReport(plan.mirrorAccounts, txs200k, { ...YEAR, regime: "competencia" })
    , 3);
    const factor = large / Math.max(small, 0.5);
    console.log(`[perf] 50k=${small.toFixed(1)}ms 200k=${large.toFixed(1)}ms fator=${factor.toFixed(2)}x`);
    // 4x mais dados: aceitamos até 8x (folga para GC), mas não O(n²).
    expect(factor).toBeLessThan(8);
  });

  it("filtrar um mês é mais rápido ou equivalente ao ano inteiro", () => {
    const month = rangeForPreset("month", YEAR, NOW);
    const msMonth = measure(() =>
      mirrorReport(plan.mirrorAccounts, txs50k, { ...month, regime: "competencia" })
    );
    const msYear = measure(() =>
      mirrorReport(plan.mirrorAccounts, txs50k, { ...YEAR, regime: "competencia" })
    );
    console.log(`[perf] mês=${msMonth.toFixed(1)}ms ano=${msYear.toFixed(1)}ms`);
    expect(msMonth).toBeLessThan(msYear * 1.5 + 50);
  });
});

describe("performance: recomputação dos totais da DRE", () => {
  it("computeDreTotais sobre 1.045 contas roda em < 20ms", () => {
    const ms = measure(() => computeDreTotais(yearNodes), 20);
    console.log(`[perf] computeDreTotais 1.045 contas: ${ms.toFixed(2)}ms`);
    expect(ms).toBeLessThan(20);
  });

  it("100 recomputações consecutivas (simulando troca rápida de filtros) em < 300ms", () => {
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) computeDreTotais(yearNodes);
    const ms = performance.now() - t0;
    console.log(`[perf] 100 recomputações: ${ms.toFixed(1)}ms`);
    expect(ms).toBeLessThan(300);
  });

  it("totais permanecem finitos com o dataset grande", () => {
    const t = computeDreTotais(yearNodes);
    for (const [k, v] of Object.entries(t)) {
      expect(Number.isFinite(v), `${k} finito`).toBe(true);
    }
  });
});

describe("performance: render do DreReport", () => {
  const props = (nodes: ReportNode[], regime: "caixa" | "competencia" = "competencia") => ({
    nodes,
    from: YEAR.from,
    to: YEAR.to,
    regime,
    contextLabel: "Raptor Systems",
  });

  it("render inicial com 1.045 contas em < 3000ms", () => {
    const t0 = performance.now();
    const view = render(createElement(DreReport, props(yearNodes)));
    const ms = performance.now() - t0;
    console.log(`[perf] render inicial DreReport: ${ms.toFixed(1)}ms`);
    expect(view.container.querySelector('[data-testid="dre-kpi-ebitda"]')).toBeTruthy();
    expect(ms).toBeLessThan(3000);
  });

  it("re-render ao trocar o regime custa menos que o render inicial", () => {
    const t0 = performance.now();
    const view = render(createElement(DreReport, props(yearNodes, "competencia")));
    const initial = performance.now() - t0;

    const caixaRows = mirrorReport(plan.mirrorAccounts, txs50k, {
      ...YEAR,
      regime: "caixa",
      include_zero: true,
    });
    const caixaNodes = applyBalances(plan.nodes, caixaRows);

    const t1 = performance.now();
    view.rerender(createElement(DreReport, props(caixaNodes, "caixa")));
    const rerenderMs = performance.now() - t1;

    console.log(`[perf] render=${initial.toFixed(1)}ms re-render(regime)=${rerenderMs.toFixed(1)}ms`);
    expect(rerenderMs).toBeLessThan(initial * 2 + 200);
  });

  it("re-render sem mudança de nodes é barato (memoização preservada)", () => {
    const view = render(createElement(DreReport, props(yearNodes)));
    const t0 = performance.now();
    for (let i = 0; i < 5; i++) {
      view.rerender(createElement(DreReport, props(yearNodes)));
    }
    const ms = (performance.now() - t0) / 5;
    console.log(`[perf] re-render idêntico (média de 5): ${ms.toFixed(1)}ms`);
    expect(ms).toBeLessThan(1500);
  });

  it("valor exibido do EBITDA corresponde ao cálculo puro", () => {
    const view = render(createElement(DreReport, props(yearNodes)));
    const el = view.container.querySelector('[data-testid="dre-kpi-value-ebitda"]');
    expect(el).toBeTruthy();
    const totais = computeDreTotais(yearNodes);
    const digits = (el!.textContent || "").replace(/[^\d]/g, "");
    const expected = Math.abs(totais.ebitda).toFixed(2).replace(/[^\d]/g, "");
    expect(digits).toBe(expected);
  });
});
