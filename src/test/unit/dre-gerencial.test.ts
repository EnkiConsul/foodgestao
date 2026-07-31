import { describe, it, expect } from "vitest";
import { computeDreTotais, totalByNature, type DreNodeLike } from "@/lib/relatorios/dre";

/**
 * Fixture fixa com lançamentos reais (empresa Raptor, 01/07–30/09/2026).
 * O relatório devolve saldo com sinal: entradas positivas, saídas negativas.
 */
const RAPTOR_Q3_2026: DreNodeLike[] = [
  { level: 1, root_code: "4", nature: "receita", dre_sign: 1, saldo_consolidado: 6226.39 },
  { level: 1, root_code: "5", nature: "custo", dre_sign: -1, saldo_consolidado: -2482.29 },
  { level: 1, root_code: "6", nature: "despesa_operacional", dre_sign: -1, saldo_consolidado: -4128.74 },
  { level: 1, root_code: "7", nature: "despesa_financeira", dre_sign: -1, saldo_consolidado: 0 },
  { level: 1, root_code: "8", nature: "imposto", dre_sign: -1, saldo_consolidado: 0 },
  // Filhos: não podem ser contados (evita dupla contagem)
  { level: 2, root_code: "4", nature: "receita", dre_sign: 1, saldo_consolidado: 4000 },
  { level: 2, root_code: "5", nature: "custo", dre_sign: -1, saldo_consolidado: -1000 },
  { level: 3, root_code: "6", nature: "despesa_operacional", dre_sign: -1, saldo_consolidado: -500 },
];

const round = (n: number) => Math.round(n * 100) / 100;

describe("DRE Gerencial — cascata com lançamentos reais", () => {
  const t = computeDreTotais(RAPTOR_Q3_2026);

  it("soma apenas contas raiz, em magnitude positiva", () => {
    expect(totalByNature(RAPTOR_Q3_2026, "receita")).toBe(6226.39);
    expect(totalByNature(RAPTOR_Q3_2026, "custo")).toBe(2482.29);
    expect(round(totalByNature(RAPTOR_Q3_2026, "despesa_operacional"))).toBe(4128.74);
    expect(totalByNature(RAPTOR_Q3_2026, "imposto")).toBe(0);
  });

  it("Receita Líquida = receita - impostos", () => {
    expect(round(t.receita_liquida)).toBe(6226.39);
  });

  it("Lucro Bruto subtrai os custos (não soma)", () => {
    expect(round(t.lucro_bruto)).toBe(3744.1);
    expect(round(t.mBruta)).toBe(60.13);
  });

  it("EBITDA = lucro bruto - despesas operacionais", () => {
    expect(round(t.ebitda)).toBe(-384.64);
  });

  it("Resultado Líquido e margem", () => {
    expect(round(t.resultado)).toBe(-384.64);
    expect(round(t.mLiquida)).toBe(-6.18);
  });

  it("margens nunca ultrapassam 100% quando há custo positivo", () => {
    expect(Math.abs(t.mBruta)).toBeLessThanOrEqual(100);
  });
});

describe("DRE — normalização de sinais e casos de borda", () => {
  it("funciona sem dre_sign/nature, usando root_code", () => {
    const nodes: DreNodeLike[] = [
      { level: 1, root_code: "4", saldo_consolidado: 1000 },
      { level: 1, root_code: "5", saldo_consolidado: -400 },
      { level: 1, root_code: "6", saldo_consolidado: -100 },
    ];
    const t = computeDreTotais(nodes);
    expect(t.receita).toBe(1000);
    expect(t.custos).toBe(400);
    expect(t.lucro_bruto).toBe(600);
    expect(t.ebitda).toBe(500);
    expect(t.resultado).toBe(500);
  });

  it("com impostos e despesa financeira, a cascata completa fecha", () => {
    const nodes: DreNodeLike[] = [
      { level: 1, root_code: "4", nature: "receita", dre_sign: 1, saldo_consolidado: 10000 },
      { level: 1, root_code: "8", nature: "imposto", dre_sign: -1, saldo_consolidado: -600 },
      { level: 1, root_code: "5", nature: "custo", dre_sign: -1, saldo_consolidado: -3400 },
      { level: 1, root_code: "6", nature: "despesa_operacional", dre_sign: -1, saldo_consolidado: -2500 },
      { level: 1, root_code: "7", nature: "despesa_financeira", dre_sign: -1, saldo_consolidado: -250 },
    ];
    const t = computeDreTotais(nodes);
    expect(t.receita_liquida).toBe(9400);
    expect(t.lucro_bruto).toBe(6000);
    expect(t.ebitda).toBe(3500);
    expect(t.resultado).toBe(3250);
    expect(round(t.mBruta)).toBe(63.83);
    expect(round(t.mLiquida)).toBe(34.57);
  });

  it("sem receita, margens são 0 e não NaN", () => {
    const t = computeDreTotais([
      { level: 1, root_code: "6", nature: "despesa_operacional", dre_sign: -1, saldo_consolidado: -300 },
    ]);
    expect(t.mBruta).toBe(0);
    expect(t.mLiquida).toBe(0);
    expect(t.resultado).toBe(-300);
  });

  it("lista vazia devolve zeros", () => {
    const t = computeDreTotais([]);
    expect(t.receita).toBe(0);
    expect(t.resultado).toBe(0);
  });
});
