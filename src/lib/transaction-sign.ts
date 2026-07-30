/**
 * Utilitário único de cor/sinal para valores monetários no app.
 *
 * Regra: verde quando o efeito no saldo é positivo (entra dinheiro),
 * vermelho quando negativo (sai), neutro quando zero.
 *
 * O tipo declarado (`receita` / `despesa`) informa a intenção; o efeito
 * final vem da combinação `type × amount`, permitindo estornos com sinal
 * invertido (receita negativa = débito, despesa negativa = crédito).
 */

const POSITIVE_CLASS = "text-success";
const NEGATIVE_CLASS = "text-destructive";
const NEUTRAL_CLASS = "text-foreground";

type SignInput = {
  transaction_type: string;
  amount: number;
};

/** Efeito algébrico do lançamento no saldo. */
export function transactionSignedAmount(t: SignInput): number {
  if (t.transaction_type === "entrada") return t.amount;
  if (t.transaction_type === "saida") return -t.amount;
  return t.amount;
}

/** Sinal do efeito no saldo. */
export function transactionEffectSign(t: SignInput): -1 | 0 | 1 {
  const s = transactionSignedAmount(t);
  return s > 0 ? 1 : s < 0 ? -1 : 0;
}

/** Classe de cor a partir de um valor numérico bruto (positivo = verde). */
export function amountColorClass(n: number | null | undefined): string {
  if (n == null || n === 0 || Number.isNaN(n)) return NEUTRAL_CLASS;
  return n > 0 ? POSITIVE_CLASS : NEGATIVE_CLASS;
}

/** Classe de cor a partir de um lançamento (usa efeito no saldo). */
export function transactionColorClass(t: SignInput): string {
  return amountColorClass(transactionSignedAmount(t));
}

/** Sinal textual (`+`/`−`) para exibir junto do valor. */
export function amountSignPrefix(n: number): string {
  if (n > 0) return "+";
  if (n < 0) return "−";
  return "";
}
