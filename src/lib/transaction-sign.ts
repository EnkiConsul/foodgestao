/**
 * Contribuição algébrica de um lançamento no saldo:
 * receita → +amount, despesa → -amount, transferência → neutro (retorna amount).
 * Como amount pode ser negativo, estornos ficam com o sinal invertido naturalmente.
 */
export function transactionSignedAmount(t: { transaction_type: string; amount: number }): number {
  if (t.transaction_type === "receita") return t.amount;
  if (t.transaction_type === "despesa") return -t.amount;
  return t.amount;
}

/** Classe de cor para exibir o VALOR de um lançamento, baseada no efeito no saldo. */
export function transactionColorClass(t: { transaction_type: string; amount: number }): string {
  const signed = transactionSignedAmount(t);
  if (signed > 0) return "text-emerald-600 dark:text-emerald-400";
  if (signed < 0) return "text-red-600 dark:text-red-400";
  return "text-muted-foreground";
}

/** Retorna o sinal (+1, -1, 0) do efeito no saldo. */
export function transactionEffectSign(t: { transaction_type: string; amount: number }): -1 | 0 | 1 {
  const signed = transactionSignedAmount(t);
  return signed > 0 ? 1 : signed < 0 ? -1 : 0;
}
