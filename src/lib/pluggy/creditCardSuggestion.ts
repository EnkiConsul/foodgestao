/**
 * Converte uma conta de crédito da Pluggy (`pluggy_accounts` do tipo CREDIT)
 * em uma sugestão de cadastro para `credit_cards`.
 *
 * Nada aqui grava dados: a sugestão é apresentada ao usuário na tela de
 * autorização, que pode editar todos os campos antes de confirmar.
 */

export interface PluggyCreditAccountLike {
  id: string;
  pluggy_account_id: string;
  name: string | null;
  number_masked: string | null;
  raw: unknown;
}

export interface CreditCardSuggestion {
  name: string;
  brand: string;
  issuer: string | null;
  holderName: string | null;
  last4: string | null;
  creditLimit: number;
  closingDay: number;
  dueDay: number;
}

const BRANDS = ["Visa", "Mastercard", "Elo", "American Express", "Hipercard", "Diners"];

/** Normaliza a bandeira reportada pela Pluggy para as opções do cadastro. */
export function normalizeBrand(raw: unknown): string {
  const value = String(raw ?? "").trim().toLowerCase();
  if (!value) return "Outro";
  if (value.includes("amex") || value.includes("american")) return "American Express";
  if (value.includes("master")) return "Mastercard";
  if (value.includes("visa")) return "Visa";
  if (value.includes("elo")) return "Elo";
  if (value.includes("hiper")) return "Hipercard";
  if (value.includes("diners")) return "Diners";
  const exact = BRANDS.find((b) => b.toLowerCase() === value);
  return exact ?? "Outro";
}

/** Extrai os 4 últimos dígitos de qualquer máscara de número de cartão. */
export function extractLast4(...candidates: unknown[]): string | null {
  for (const candidate of candidates) {
    const digits = String(candidate ?? "").replace(/\D/g, "");
    if (digits.length >= 4) return digits.slice(-4);
  }
  return null;
}

/**
 * Dia do mês a partir de uma data ISO da Pluggy, limitado a 1..28 para
 * respeitar a validação do cadastro de cartões (meses curtos).
 */
export function dayFromIsoDate(value: unknown, fallback: number): number {
  const text = String(value ?? "");
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  let day: number | null = null;
  if (match) {
    day = Number(match[3]);
  } else if (text) {
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) day = parsed.getUTCDate();
  }
  if (!day || Number.isNaN(day)) return fallback;
  return Math.min(28, Math.max(1, day));
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function buildCreditCardSuggestion(account: PluggyCreditAccountLike): CreditCardSuggestion {
  const raw = (account.raw ?? {}) as Record<string, unknown>;
  const credit = (raw.creditData ?? raw.credit_data ?? {}) as Record<string, unknown>;
  const owner = (raw.owner ?? {}) as Record<string, unknown>;

  const closingDay = dayFromIsoDate(credit.balanceCloseDate ?? credit.balance_close_date, 1);
  const dueDay = dayFromIsoDate(credit.balanceDueDate ?? credit.balance_due_date, 10);

  return {
    name: account.name ?? String(raw.marketingName ?? raw.name ?? "Cartão de crédito"),
    brand: normalizeBrand(credit.brand ?? credit.level),
    issuer: (raw.marketingName as string | undefined) ?? null,
    holderName:
      (raw.owner as string | undefined) && typeof raw.owner === "string"
        ? (raw.owner as string)
        : ((owner.name as string | undefined) ?? (raw.ownerName as string | undefined) ?? null),
    last4: extractLast4(account.number_masked, raw.number, credit.number),
    creditLimit: toNumber(credit.creditLimit ?? credit.limit ?? credit.availableCreditLimit),
    closingDay,
    dueDay,
  };
}
