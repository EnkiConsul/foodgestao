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
  parcel_direction?: string | null;
  installment_number?: number | null;
};

/**
 * Mapeia parcelado → receita/despesa conforme a direção.
 * Retorna null para o "parent" (installment_number IS NULL) que não afeta saldo.
 */
export function effectiveTransactionType(
  t: Pick<SignInput, "transaction_type" | "parcel_direction" | "installment_number">,
): "receita" | "despesa" | "transferencia" | null {
  if (t.transaction_type === "parcelado") {
    if (t.installment_number == null) return null; // parent âncora
    return t.parcel_direction === "entrada" ? "receita" : "despesa";
  }
  if (t.transaction_type === "receita" || t.transaction_type === "despesa" || t.transaction_type === "transferencia") {
    return t.transaction_type;
  }
  return null;
}

/** Efeito algébrico do lançamento no saldo. */
export function transactionSignedAmount(t: SignInput): number {
  const eff = effectiveTransactionType(t);
  if (eff === "receita") return t.amount;
  if (eff === "despesa") return -t.amount;
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
