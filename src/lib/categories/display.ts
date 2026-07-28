/**
 * Fonte única de verdade para a apresentação da hierarquia de categorias.
 * A hierarquia é comunicada APENAS por indentação + badge de tipo
 * (Receita/Despesa). Nada de numeração posicional ou códigos contábeis.
 */

/** Passo de indentação (px) por nível de profundidade. */
export const CATEGORY_INDENT_STEP = 16;

/** Indentação em px para um nível da árvore. */
export function categoryIndent(depth: number, basePx = 0): number {
  return basePx + Math.max(0, depth) * CATEGORY_INDENT_STEP;
}

export type CategoryTransactionType = "receita" | "despesa" | string;

export const CATEGORY_TYPE_LABEL: Record<string, string> = {
  receita: "Receita",
  despesa: "Despesa",
};

export const CATEGORY_TYPE_CLS: Record<string, string> = {
  receita: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  despesa: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

export function categoryTypeLabel(type: CategoryTransactionType): string {
  return CATEGORY_TYPE_LABEL[type] ?? CATEGORY_TYPE_LABEL.receita;
}

export function categoryTypeClass(type: CategoryTransactionType): string {
  return CATEGORY_TYPE_CLS[type] ?? CATEGORY_TYPE_CLS.receita;
}

export const CATEGORY_SUBTYPE_LABEL: Record<string, string> = {
  receita: "Receita",
  saida: "Saída",
  custo: "Custo",
  despesa: "Despesa",
  imposto: "Imposto",
  investimento: "Investimento",
};

export const CATEGORY_SUBTYPE_CLS: Record<string, string> = {
  receita: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  saida: "bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400",
  custo: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  despesa: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  imposto: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  investimento: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
};
