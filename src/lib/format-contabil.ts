export const brl = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n ?? 0);

/** Formato contábil: negativos entre parênteses. */
export const brlAcc = (n: number) => {
  const v = Number(n ?? 0);
  if (v < 0) return `(${brl(-v).replace("R$", "R$ ").replace(/\s+/g, " ").trim().replace("R$ -", "R$ ")})`;
  return brl(v);
};

export const pct = (n: number, digits = 1) =>
  (Number.isFinite(n) ? n : 0).toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }) + "%";

export const signClass = (n: number) =>
  n > 0 ? "text-success" : n < 0 ? "text-destructive" : "text-foreground";

/** Sinal da natureza na DRE: receita = +1; custo/despesa/imposto = -1. */
const NATURE_SIGN: Record<string, number> = {
  receita: 1,
  custo: -1,
  despesa_operacional: -1,
  despesa_financeira: -1,
  imposto: -1,
};

const ROOT_SIGN: Record<string, number> = {
  "4": 1,
  "5": -1,
  "6": -1,
  "7": -1,
  "8": -1,
};

/**
 * Sinal a aplicar sobre o saldo bruto (entradas +, saídas -) para obter a
 * magnitude da linha na DRE. Usa dre_sign/nature vindos do relatório e cai
 * para o mapa por código raiz quando ausentes.
 */
export function dreSign(node: {
  dre_sign?: number | null;
  nature?: string | null;
  root_code?: string | null;
}): number {
  if (node.dre_sign === 1 || node.dre_sign === -1) return node.dre_sign;
  if (node.nature && NATURE_SIGN[node.nature] !== undefined) return NATURE_SIGN[node.nature];
  if (node.root_code && ROOT_SIGN[node.root_code] !== undefined) return ROOT_SIGN[node.root_code];
  return 1;
}

