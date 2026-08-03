/**
 * Compatibilidade entre uma categoria (padrão ou da empresa) e a conta
 * contábil escolhida. Regras espelhadas na trigger do banco
 * `category_templates_validate_chart_account`.
 */

export type ChartAccountLike = {
  code: string;
  name?: string | null;
  is_synthetic?: boolean | null;
};

export type ChartCompatResult = {
  ok: boolean;
  /** Mensagem de erro (bloqueia) ou de atenção (não bloqueia). */
  message?: string;
  level?: "error" | "warning";
};

const ROOT_LABEL: Record<string, string> = {
  "1": "Ativo",
  "2": "Passivo",
  "3": "Patrimônio Líquido",
  "4": "Receitas",
  "5": "Custos",
  "6": "Despesas Operacionais",
  "7": "Despesas Financeiras",
  "8": "Impostos e Tributos",
  "9": "Contas de Controle",
};

const OUTFLOW_ROOTS = ["5", "6", "7", "8"];

/** Subtipos que NÃO são de resultado: usam contas patrimoniais ou de controle. */
const NON_RESULT_SUBTYPES = ["investimento", "patrimonial", "transferencia"];
const NON_RESULT_ROOTS = ["1", "2", "3", "9"];

/** Subtipo esperado por raiz — usado apenas para alertas. */
const SUBTYPE_ROOTS: Record<string, string[]> = {
  receita: ["4"],
  custo: ["5"],
  despesa: ["6", "7"],
  imposto: ["8", "7"],
  saida: ["5", "6", "7", "8"],
  investimento: ["1", "2", "3", "9"],
  patrimonial: ["1", "2", "3", "9"],
  transferencia: ["1", "2", "9"],
};

export function chartRootCode(code: string): string {
  return (code ?? "").trim().split(".")[0] ?? "";
}

export function chartRootLabel(code: string): string {
  const root = chartRootCode(code);
  return ROOT_LABEL[root] ?? `Grupo ${root || "?"}`;
}

export function isNonResultSubtype(subtype?: string | null): boolean {
  return !!subtype && NON_RESULT_SUBTYPES.includes(subtype);
}

export function validateChartAccountLink(args: {
  transactionType: "entrada" | "saida" | "transferencia" | string;
  subtype?: string | null;
  account: ChartAccountLike | null | undefined;
}): ChartCompatResult {
  const { transactionType, subtype, account } = args;
  if (!account) return { ok: true };

  const root = chartRootCode(account.code);
  const label = chartRootLabel(account.code);

  if (account.is_synthetic) {
    return {
      ok: false,
      level: "error",
      message: `A conta ${account.code} — ${account.name ?? ""} é sintética (agrupadora) e não recebe lançamentos. Escolha uma conta analítica (nível mais baixo).`,
    };
  }

  // Categorias de investimento, patrimoniais e de transferência não passam
  // pela DRE: elas usam contas de Ativo, Passivo, PL ou de controle.
  if (isNonResultSubtype(subtype) || transactionType === "transferencia") {
    if (!NON_RESULT_ROOTS.includes(root)) {
      return {
        ok: false,
        level: "error",
        message: `Categorias de investimento, patrimoniais ou de transferência devem usar contas de Ativo, Passivo, Patrimônio Líquido ou de controle (grupos 1, 2, 3 ou 9). A conta ${account.code} está em ${label}.`,
      };
    }
    return { ok: true };
  }

  if (["1", "2", "3"].includes(root)) {
    return {
      ok: false,
      level: "error",
      message: `A conta ${account.code} pertence ao grupo ${label}, que é patrimonial. Categorias de resultado só podem ser vinculadas a contas de Receitas, Custos, Despesas ou Impostos.`,
    };
  }

  if (!["4", "5", "6", "7", "8", "9"].includes(root)) {
    return {
      ok: false,
      level: "error",
      message: `A conta ${account.code} não pertence a um grupo de resultado válido.`,
    };
  }

  if (transactionType === "entrada" && OUTFLOW_ROOTS.includes(root)) {
    return {
      ok: false,
      level: "error",
      message: `Categoria de Entrada não pode usar a conta ${account.code} (${label}). Use uma conta do grupo 4 — Receitas.`,
    };
  }

  if (transactionType === "saida" && root === "4") {
    return {
      ok: false,
      level: "error",
      message: `Categoria de Saída não pode usar a conta ${account.code} (Receitas). Use uma conta de Custos, Despesas ou Impostos (grupos 5 a 8).`,
    };
  }

  const expected = subtype ? SUBTYPE_ROOTS[subtype] : undefined;
  if (expected && root !== "9" && !expected.includes(root)) {
    return {
      ok: true,
      level: "warning",
      message: `Atenção: o subtipo selecionado normalmente usa contas dos grupos ${expected.join(", ")}, e a conta ${account.code} está em ${label}.`,
    };
  }

  return { ok: true };
}

/** Filtra as contas elegíveis para um tipo/subtipo de categoria. */
export function isChartAccountEligible(
  account: ChartAccountLike,
  transactionType: "entrada" | "saida" | "transferencia" | string,
  subtype?: string | null
): boolean {
  return validateChartAccountLink({ transactionType, subtype, account }).ok;
}

