// Interpretação do saldo reportado pelo Open Finance.
//
// Bancos expõem o saldo em `balance` (espelho de `bankData.closingBalance`).
// Em alguns conectores esse campo é um saldo de fechamento e não o saldo
// disponível — caso do Santander PJ, que devolveu `closingBalance: -53.26`
// para uma conta corrente sem limite de cheque especial contratado e sem uso
// de descoberto (`overdraftContractedLimit: 0`, `overdraftUsedLimit: 0`,
// `unarrangedOverdraftAmount: 0`), enquanto o saldo real da conta era positivo.
//
// Regras:
// 1. Quando o saldo é negativo em conta corrente sem qualquer indício de
//    descoberto, tentamos o saldo disponível somando o valor aplicado
//    automaticamente (`bankData.automaticallyInvestedBalance`).
// 2. Se ainda assim o valor continuar negativo, ele é considerado não
//    confiável: NÃO semeia o saldo inicial da conta local e fica apenas como
//    referência do banco (`bank_balance`), marcado como descartado para a
//    interface não tratar a diferença como divergência de conciliação.

export const BANK_BALANCE_SOURCE_OPEN_FINANCE = 'open_finance';
export const BANK_BALANCE_SOURCE_OPEN_FINANCE_DISCARDED = 'open_finance_descartado';

export interface OpenFinanceAccountBalanceInput {
  type?: string | null;
  subtype?: string | null;
  balance?: number | null;
  bankData?: {
    closingBalance?: number | null;
    automaticallyInvestedBalance?: number | null;
    overdraftContractedLimit?: number | null;
    overdraftUsedLimit?: number | null;
    unarrangedOverdraftAmount?: number | null;
  } | null;
}

export interface OpenFinanceBalance {
  /** Valor de referência resolvido (pode incluir aplicação automática), ou null. */
  reported: number | null;
  /** Valor cru devolvido pelo banco, ou null quando ausente. */
  rawReported: number | null;
  /** Valor que pode semear o saldo inicial da conta local, ou null. */
  seed: number | null;
  /** true quando o valor do banco é implausível e foi descartado do seed. */
  implausible: boolean;
  /** Rótulo para `accounts.bank_balance_source`. */
  source: string | null;
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

export function resolveOpenFinanceBalance(acc: OpenFinanceAccountBalanceInput): OpenFinanceBalance {
  const raw = typeof acc?.balance === 'number' && Number.isFinite(acc.balance) ? acc.balance : null;
  if (raw === null) {
    return { reported: null, rawReported: null, seed: null, implausible: false, source: null };
  }

  const isBankAccount = String(acc?.type ?? '').toUpperCase() === 'BANK';
  const subtype = String(acc?.subtype ?? '').toUpperCase();
  const isChecking = subtype === '' || subtype.includes('CHECKING');
  const bd = acc?.bankData ?? null;
  const hasOverdraft =
    num(bd?.overdraftContractedLimit) > 0 ||
    num(bd?.overdraftUsedLimit) > 0 ||
    num(bd?.unarrangedOverdraftAmount) > 0;

  const suspect = raw < 0 && isBankAccount && isChecking && !hasOverdraft;
  if (!suspect) {
    return {
      reported: raw,
      rawReported: raw,
      seed: raw,
      implausible: false,
      source: BANK_BALANCE_SOURCE_OPEN_FINANCE,
    };
  }

  // Tenta o saldo disponível: fechamento + aplicação automática (ContaMax etc.).
  const invested = num(bd?.automaticallyInvestedBalance);
  if (invested > 0) {
    const available = round2(raw + invested);
    if (available >= 0) {
      return {
        reported: available,
        rawReported: raw,
        seed: available,
        implausible: false,
        source: BANK_BALANCE_SOURCE_OPEN_FINANCE,
      };
    }
  }

  return {
    reported: raw,
    rawReported: raw,
    seed: null,
    implausible: true,
    source: BANK_BALANCE_SOURCE_OPEN_FINANCE_DISCARDED,
  };
}
