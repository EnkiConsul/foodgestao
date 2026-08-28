/**
 * Rótulos de contas/cartões vindos do Open Finance.
 *
 * A Pluggy às vezes devolve a conta de cartão sem nome útil (literalmente
 * "Sem nome"), então preferimos o cadastro local do cartão para o rótulo.
 */

const PLACEHOLDERS = new Set(["sem nome", "sem nome.", "-", "--", "n/a", "na", "null", "undefined"]);

/** Normaliza um nome vindo do provedor, descartando placeholders. */
export function cleanProviderName(name: string | null | undefined): string | null {
  const value = (name ?? "").trim();
  if (!value) return null;
  if (PLACEHOLDERS.has(value.toLowerCase())) return null;
  return value;
}

export interface CardLabelInput {
  issuer?: string | null;
  brand?: string | null;
  last4?: string | null;
}

/**
 * Rótulo do cartão a partir do cadastro local, com o nome do provedor como
 * segunda opção. Retorna null quando não há nada apresentável.
 */
export function creditCardLabel(card: CardLabelInput | null | undefined, providerName?: string | null): string | null {
  const issuer = (card?.issuer ?? "").trim() || (card?.brand ?? "").trim();
  const last4 = (card?.last4 ?? "").trim();
  if (issuer && last4) return `${issuer} •••• ${last4}`;
  if (issuer) return issuer;
  if (last4) return `•••• ${last4}`;
  return cleanProviderName(providerName);
}
