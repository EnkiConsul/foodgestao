import { dreSign } from "@/lib/format-contabil";

/** Subconjunto do ReportNode necessário para os cálculos da DRE. */
export interface DreNodeLike {
  level: number;
  nature?: string | null;
  root_code?: string | null;
  dre_sign?: number | null;
  saldo_consolidado?: number | null;
}

export const NATURE_ROOT: Record<string, string> = {
  receita: "4",
  custo: "5",
  despesa_operacional: "6",
  despesa_financeira: "7",
  imposto: "8",
};

export interface DreTotais {
  receita: number;
  impostos: number;
  receita_liquida: number;
  custos: number;
  lucro_bruto: number;
  despOp: number;
  ebitda: number;
  despFin: number;
  resultado: number;
  mBruta: number;
  mLiquida: number;
}

/**
 * Total de uma natureza em magnitude positiva.
 * O relatório devolve saldo com sinal (entrada +, saída -), então despesas,
 * custos e impostos chegam negativos: aplicamos dre_sign para normalizar.
 * Somente contas raiz (level=1) para evitar dupla contagem.
 */
export function totalByNature(nodes: DreNodeLike[], nature: string): number {
  const rootCode = NATURE_ROOT[nature];
  return nodes
    .filter((n) => n.level === 1 && (n.nature === nature || (!n.nature && n.root_code === rootCode)))
    .reduce((s, n) => s + Number(n.saldo_consolidado || 0) * dreSign(n), 0);
}

/** Cascata da DRE gerencial: receita → líquida → bruto → EBITDA → resultado. */
export function computeDreTotais(nodes: DreNodeLike[]): DreTotais {
  const receita = totalByNature(nodes, "receita");
  const impostos = totalByNature(nodes, "imposto");
  const custos = totalByNature(nodes, "custo");
  const despOp = totalByNature(nodes, "despesa_operacional");
  const despFin = totalByNature(nodes, "despesa_financeira");

  const receita_liquida = receita - impostos;
  const lucro_bruto = receita_liquida - custos;
  const ebitda = lucro_bruto - despOp;
  const resultado = ebitda - despFin;
  const mBruta = receita_liquida ? (lucro_bruto / receita_liquida) * 100 : 0;
  const mLiquida = receita_liquida ? (resultado / receita_liquida) * 100 : 0;

  return {
    receita,
    impostos,
    receita_liquida,
    custos,
    lucro_bruto,
    despOp,
    ebitda,
    despFin,
    resultado,
    mBruta,
    mLiquida,
  };
}
