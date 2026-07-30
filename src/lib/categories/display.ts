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

/**
 * Níveis de guia vertical a desenhar antes do conteúdo de uma linha.
 * Um nível 0 não tem guias; nível 2 tem duas guias (uma por ancestral).
 */
export function categoryGuideLevels(depth: number): number[] {
  const d = Math.max(0, Math.floor(depth || 0));
  return Array.from({ length: d }, (_, i) => i);
}

export type CategoryTransactionType = "entrada" | "saida" | string;

export const CATEGORY_TYPE_LABEL: Record<string, string> = {
  entrada: "Entrada",
  saida: "Saída",
};

export const CATEGORY_TYPE_CLS: Record<string, string> = {
  entrada: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  saida: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

export function categoryTypeLabel(type: CategoryTransactionType): string {
  return CATEGORY_TYPE_LABEL[type] ?? CATEGORY_TYPE_LABEL.entrada;
}

export function categoryTypeClass(type: CategoryTransactionType): string {
  return CATEGORY_TYPE_CLS[type] ?? CATEGORY_TYPE_CLS.entrada;
}

export const CATEGORY_SUBTYPE_LABEL: Record<string, string> = {
  receita: "Entrada",
  saida: "Saída",
  custo: "Custo",
  despesa: "Saída",
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
