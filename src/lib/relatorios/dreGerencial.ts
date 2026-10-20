import { dreSign } from "@/lib/format-contabil";

/**
 * DRE gerencial food service (plano de contas food_service_v5).
 * Linhas resolvidas pelo código da conta; o resultado líquido é sempre a soma
 * de todas as contas de resultado (grupos 4 a 8), igual à DRE anterior.
 */
export interface DreGerencialNode {
  code: string;
  level: number;
  nature?: string | null;
  root_code?: string | null;
  dre_sign?: number | null;
  saldo_consolidado?: number | null;
}

export interface DreGerencial {
  receitaBruta: number;
  deducoes: number;
  receitaLiquida: number;
  cmv: number;
  lucroBruto: number;
  maoObraDireta: number;
  primeCost: number;
  margemAposMaoObra: number;
  despesasVariaveis: number;
  margemContribuicao: number;
  estrutura: number;
  administracao: number;
  pessoalAdministrativo: number;
  proLabore: number;
  outrasOperacionais: number;
  outrasReceitas: number;
  ebitda: number;
  resultadoFinanceiro: number;
  resultadoAntesIr: number;
  irpjCsll: number;
  resultadoLiquido: number;
}

const rootOf = (code: string) => code.split(".")[0];

export function computeDreGerencial(nodes: DreGerencialNode[]): DreGerencial {
  const byCode = new Map(nodes.map((n) => [n.code, n]));
  // Valor com sinal natural: receitas positivas, gastos positivos (magnitude).
  const v = (code: string) => {
    const n = byCode.get(code);
    if (!n) return 0;
    return Number(n.saldo_consolidado || 0) * dreSign({ ...n, root_code: n.root_code ?? rootOf(code) });
  };
  // Saldo com sinal de resultado (+ melhora o lucro, − piora).
  const r = (code: string) => {
    const n = byCode.get(code);
    return n ? Number(n.saldo_consolidado || 0) : 0;
  };

  const receitaBruta = v("4.1");
  const deducoes = -r("4.3") + v("8.1");
  const receitaLiquida = receitaBruta - deducoes;

  const cmv = v("5.1") + v("5.3");
  const lucroBruto = receitaLiquida - cmv;
  const maoObraDireta = v("5.2");
  const primeCost = cmv + maoObraDireta;
  const margemAposMaoObra = lucroBruto - maoObraDireta;
  const despesasVariaveis = v("6.1");
  const margemContribuicao = margemAposMaoObra - despesasVariaveis;

  const estrutura = v("6.2");
  const pessoalAdministrativo = v("6.3.2") + v("6.3.6");
  const proLabore = v("6.3.7");
  const administracao = v("6.3") - pessoalAdministrativo - proLabore;
  const outrasOperacionais = v("8.3") + sumOtherRoots(nodes, v);
  const outrasReceitas = r("4.2") - r("4.2.1");
  const ebitda =
    margemContribuicao - estrutura - administracao - pessoalAdministrativo - proLabore - outrasOperacionais + outrasReceitas;

  const resultadoFinanceiro = r("4.2.1") + r("7");
  const resultadoAntesIr = ebitda + resultadoFinanceiro;
  const irpjCsll = v("8.2");
  const resultadoLiquido = resultadoAntesIr - irpjCsll;

  return {
    receitaBruta, deducoes, receitaLiquida, cmv, lucroBruto, maoObraDireta, primeCost, margemAposMaoObra,
    despesasVariaveis, margemContribuicao, estrutura, administracao, pessoalAdministrativo, proLabore,
    outrasOperacionais, outrasReceitas, ebitda, resultadoFinanceiro, resultadoAntesIr, irpjCsll, resultadoLiquido,
  };
}

/** Subgrupos de nível 2 criados pelo cliente fora do modelo (ex.: 6.9, 4.7) — nunca somem do resultado. */
function sumOtherRoots(nodes: DreGerencialNode[], v: (c: string) => number): number {
  const known = new Set(["4.1", "4.2", "4.3", "5.1", "5.2", "5.3", "6.1", "6.2", "6.3", "7.1", "8.1", "8.2", "8.3"]);
  let total = 0;
  for (const n of nodes) {
    if (n.level !== 2 || known.has(n.code)) continue;
    const root = rootOf(n.code);
    if (!["4", "5", "6", "7", "8"].includes(root)) continue;
    // Receitas extras reduzem "outras despesas"; gastos extras somam.
    total += root === "4" ? -Number(n.saldo_consolidado || 0) : v(n.code);
  }
  return total;
}
