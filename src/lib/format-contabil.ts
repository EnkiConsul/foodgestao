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
