/**
 * Testes de robustez numérica dos relatórios contábeis.
 *
 * Objetivo: garantir que valores muito altos e um grande volume de lançamentos
 * não causem estouro (Infinity/NaN), perda de precisão relevante nos totais
 * nem quebra da formatação contábil.
 */
import { describe, it, expect } from "vitest";
import { computeDreTotais, totalByNature, type DreNodeLike } from "@/lib/relatorios/dre";
import {
  mirrorReport,
  type MirrorAccount,
  type MirrorTransaction,
} from "@/lib/relatorios/reportRpcMirror";
import { brlAcc, pct } from "@/lib/format-contabil";

// Maior valor "de negócio" plausível: 1 trilhão de reais com centavos.
const TRILHAO = 1_000_000_000_000;

function node(
  nature: string,
  saldo: number,
  extra: Partial<DreNodeLike> = {}
): DreNodeLike {
  return { level: 1, nature, saldo_consolidado: saldo, ...extra };
}

function tx(over: Partial<MirrorTransaction> = {}): MirrorTransaction {
  return {
    account_id: "a1",
    transaction_type: "entrada",
    status: "confirmado",
    amount: 100,
    amount_paid: 100,
    due_date: "2026-03-10",
    transaction_date: "2026-03-10",
    payment_date: "2026-03-10",
    ...over,
  };
}

describe("robustez: DRE com valores extremos", () => {
  it("mantém a cascata finita e coerente na casa do trilhão", () => {
    const t = computeDreTotais([
      node("receita", TRILHAO),
      node("imposto", -0.1 * TRILHAO),
      node("custo", -0.4 * TRILHAO),
      node("despesa_operacional", -0.2 * TRILHAO),
      node("despesa_financeira", -0.05 * TRILHAO),
    ]);

    for (const [k, v] of Object.entries(t)) {
      expect(Number.isFinite(v), `${k} deve ser finito`).toBe(true);
      expect(Number.isNaN(v), `${k} não deve ser NaN`).toBe(false);
    }

    expect(t.receita_liquida).toBeCloseTo(0.9 * TRILHAO, 2);
    expect(t.lucro_bruto).toBeCloseTo(0.5 * TRILHAO, 2);
    expect(t.ebitda).toBeCloseTo(0.3 * TRILHAO, 2);
    expect(t.resultado).toBeCloseTo(0.25 * TRILHAO, 2);
    // Identidade da cascata deve fechar mesmo em escala extrema.
    expect(t.resultado).toBeCloseTo(
      t.receita - t.impostos - t.custos - t.despOp - t.despFin,
      2
    );
  });

  it("não perde centavos ao somar 20.000 contas de receita", () => {
    const nodes = Array.from({ length: 20_000 }, () => node("receita", 0.01));
    const total = totalByNature(nodes, "receita");
    // 20.000 x R$ 0,01 = R$ 200,00 (tolerância de 1 centavo para ponto flutuante)
    expect(Math.abs(total - 200)).toBeLessThan 0.01;
  });

  it("percentuais não explodem quando a receita líquida é zero", () => {
    const t = computeDreTotais([node("custo", -TRILHAO)]);
    expect(t.receita_liquida).toBe(0);
    expect(t.mBruta).toBe(0);
    expect(t.mLiquida).toBe(0);
    expect(pct(t.mBruta)).toBe("0,0%");
  });

  it("margens permanecem finitas com receita líquida mínima e custo enorme", () => {
    const t = computeDreTotais([node("receita", 0.01), node("custo", -TRILHAO)]);
    expect(Number.isFinite(t.mBruta)).toBe(true);
    expect(Number.isFinite(t.mLiquida)).toBe(true);
    expect(pct(t.mBruta)).not.toContain("Infinity");
  });

  it("ignora saldos nulos/indefinidos sem gerar NaN", () => {
    const t = computeDreTotais([
      node("receita", TRILHAO),
      { level: 1, nature: "receita", saldo_consolidado: null },
      { level: 1, nature: "receita" },
    ]);
    expect(t.receita).toBe(TRILHAO);
    expect(Number.isNaN(t.resultado)).toBe(false);
  });
});

describe("robustez: espelho da RPC com volume e valores altos", () => {
  const accounts: MirrorAccount[] = [
    { id: "root", code: "4", name: "Receitas" },
    { id: "a1", code: "4.1", name: "Vendas" },
    { id: "a2", code: "4.2", name: "Serviços" },
  ];

  it("consolida 50.000 lançamentos sem estouro e com saldo exato", () => {
    const txs: MirrorTransaction[] = [];
    for (let i = 0; i < 25_000; i++) {
      txs.push(tx({ account_id: "a1", amount: 1_000_000, amount_paid: 1_000_000 }));
      txs.push(tx({ account_id: "a2", amount: 1_000_000, amount_paid: 1_000_000 }));
    }

    const rows = mirrorReport(accounts, txs, {
      from: "2026-01-01",
      to: "2026-12-31",
      regime: "competencia",
    });

    const root = rows.find((r) => r.code === "4")!;
    expect(Number.isFinite(root.saldo_consolidado)).toBe(true);
    // 50.000 x R$ 1.000.000 = R$ 50.000.000.000
    expect(root.saldo_consolidado).toBe(50_000_000_000);
    const filhos = rows
      .filter((r) => r.code.startsWith("4."))
      .reduce((s, r) => s + r.saldo_consolidado, 0);
    expect(root.saldo_consolidado).toBe(filhos);
  });

  it("mantém precisão de centavos com 10.000 lançamentos de R$ 0,01", () => {
    const txs = Array.from({ length: 10_000 }, () =>
      tx({ account_id: "a1", amount: 0.01, amount_paid: 0.01 })
    );
    const rows = mirrorReport(accounts, txs, {
      from: "2026-01-01",
      to: "2026-12-31",
      regime: "competencia",
    });
    expect(rows.find((r) => r.code === "4.1")!.saldo_consolidado).toBe(100);
  });

  it("entradas e saídas gigantes que se anulam resultam em zero exato", () => {
    const rows = mirrorReport(accounts, [
      tx({ account_id: "a1", transaction_type: "entrada", amount: TRILHAO }),
      tx({ account_id: "a1", transaction_type: "saida", amount: TRILHAO }),
    ], { from: "2026-01-01", to: "2026-12-31", regime: "competencia" });

    const row = rows.find((r) => r.code === "4.1")!;
    expect(row.saldo_proprio).toBe(0);
    expect(row.saldo_consolidado).toBe(0);
    expect(row.has_movement).toBe(true);
  });

  it("regime caixa com valores extremos permanece finito", () => {
    const rows = mirrorReport(accounts, [
      tx({ account_id: "a2", amount: TRILHAO, amount_paid: TRILHAO }),
      tx({ account_id: "a2", amount: TRILHAO, amount_paid: TRILHAO }),
    ], { from: "2026-01-01", to: "2026-12-31", regime: "caixa" });

    const row = rows.find((r) => r.code === "4.2")!;
    expect(Number.isFinite(row.saldo_consolidado)).toBe(true);
    expect(row.saldo_consolidado).toBe(2 * TRILHAO);
  });
});

describe("robustez: formatação de valores extremos", () => {
  it("formata trilhões sem notação científica", () => {
    const s = brlAcc(TRILHAO);
    expect(s).not.toContain("e+");
    expect(s.startsWith("R$")).toBe(true);
  });

  it("negativos extremos usam parênteses e permanecem legíveis", () => {
    const s = brlAcc(-TRILHAO);
    expect(s.startsWith("(")).toBe(true);
    expect(s.endsWith(")")).toBe(true);
    expect(s).not.toContain("-");
  });

  it("valores não finitos não quebram a formatação", () => {
    expect(() => brlAcc(Number.POSITIVE_INFINITY)).not.toThrow();
    expect(pct(Number.POSITIVE_INFINITY)).toBe("0,0%");
    expect(pct(Number.NaN)).toBe("0,0%");
  });
});
