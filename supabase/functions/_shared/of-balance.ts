// Interpretação do saldo reportado pelo Open Finance.
//
// Bancos expõem o saldo em `balance` (espelho de `bankData.closingBalance`).
// Em alguns conectores esse campo é um saldo de fechamento e não o saldo
// disponível — caso do Santander PJ, que devolveu `closingBalance: -53.26`
// para uma conta corrente sem limite de cheque especial contratado e sem uso
// de descoberto (`overdraftContractedLimit: 0`, `overdraftUsedLimit: 0`,
// `unarrangedOverdraftAmount: 0`), enquanto o saldo real da conta era positivo.
//
// Regra: um saldo negativo em conta corrente só é possível com descoberto.
// Sem qualquer indício de descoberto, o valor é considerado não confiável e
// NÃO semeia o saldo inicial da conta local — fica apenas como referência do
// banco (`bank_balance`), para o usuário informar o saldo correto.

export interface OpenFinanceAccountBalanceInput {
  type?: string | null;
  subtype?: string | null;
  balance?: number | null;
  bankData?: {
    closingBalance?: number | null;
    overdraftContractedLimit?: number | null;
    overdraftUsedLimit?: number | null;
    unarrangedOverdraftAmount?: number | null;
  } | null;
}

export interface OpenFinanceBalance {
  /** Valor reportado pelo banco (referência), ou null quando ausente. */
  reported: number | null;
  /** Valor que pode semear o saldo inicial da conta local, ou null. */
  seed: number | null;
  /** true quando o valor do banco é implausível e foi descartado do seed. */
  implausible: boolean;
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function resolveOpenFinanceBalance(acc: OpenFinanceAccountBalanceInput): OpenFinanceBalance {
  const reported = typeof acc?.balance === 'number' && Number.isFinite(acc.balance) ? acc.balance : null;
  if (reported === null) return { reported: null, seed: null, implausible: false };

  const isBankAccount = String(acc?.type ?? '').toUpperCase() === 'BANK';
  const subtype = String(acc?.subtype ?? '').toUpperCase();
  const isChecking = subtype === '' || subtype.includes('CHECKING');
  const bd = acc?.bankData ?? null;
  const hasOverdraft =
    num(bd?.overdraftContractedLimit) > 0 ||
    num(bd?.overdraftUsedLimit) > 0 ||
    num(bd?.unarrangedOverdraftAmount) > 0;

  const implausible = reported < 0 && isBankAccount && isChecking && !hasOverdraft;
  return { reported, seed: implausible ? null : reported, implausible };
}
