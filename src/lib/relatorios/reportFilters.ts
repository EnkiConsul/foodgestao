import {
  format,
  startOfMonth,
  endOfMonth,
  subMonths,
  startOfYear,
  endOfYear,
  startOfQuarter,
  endOfQuarter,
} from "date-fns";

export type Preset = "month" | "prev_month" | "quarter" | "year" | "12m" | "custom";
export type Regime = "caixa" | "competencia";

export interface DateRange {
  from: string; // yyyy-MM-dd
  to: string; // yyyy-MM-dd
}

/**
 * Intervalo de datas de cada preset do filtro de período.
 * `now` é injetável para tornar o cálculo testável.
 */
export function rangeForPreset(
  preset: Preset,
  current: DateRange,
  now: Date = new Date()
): DateRange {
  const fmt = (from: Date, to: Date) => ({
    from: format(from, "yyyy-MM-dd"),
    to: format(to, "yyyy-MM-dd"),
  });

  switch (preset) {
    case "month":
      return fmt(startOfMonth(now), endOfMonth(now));
    case "prev_month": {
      const d = subMonths(now, 1);
      return fmt(startOfMonth(d), endOfMonth(d));
    }
    case "quarter":
      return fmt(startOfQuarter(now), endOfQuarter(now));
    case "year":
      return fmt(startOfYear(now), endOfYear(now));
    case "12m":
      return fmt(startOfMonth(subMonths(now, 11)), endOfMonth(now));
    default:
      return { from: current.from, to: current.to };
  }
}

/* -------------------------------------------------------------------------- */
/* Espelho puro da RPC chart_accounts_report (para testes de filtros)          */
/* -------------------------------------------------------------------------- */

export interface ReportTransaction {
  account_code: string;
  transaction_type: "entrada" | "saida";
  amount: number;
  amount_paid: number | null;
  due_date: string;
  payment_date: string | null;
}

export interface ReportAccount {
  code: string;
  name: string;
}

export interface ReportRow extends ReportAccount {
  creditos: number;
  debitos: number;
  saldo: number;
  has_movement: boolean;
}

export interface AggregateFilters extends DateRange {
  regime: Regime;
  include_zero?: boolean;
}

/**
 * Data e valor efetivos conforme o regime:
 * - competência: vencimento + valor total
 * - caixa: data de pagamento + valor pago (> 0)
 */
export function effectiveEntry(
  tx: ReportTransaction,
  regime: Regime
): { date: string; value: number } | null {
  if (regime === "competencia") {
    return { date: tx.due_date, value: Number(tx.amount) || 0 };
  }
  const paid = Number(tx.amount_paid) || 0;
  if (!tx.payment_date || paid <= 0) return null;
  return { date: tx.payment_date, value: paid };
}

export function aggregateReport(
  accounts: ReportAccount[],
  transactions: ReportTransaction[],
  filters: AggregateFilters
): ReportRow[] {
  const totals = new Map<string, { creditos: number; debitos: number }>();

  for (const tx of transactions) {
    const entry = effectiveEntry(tx, filters.regime);
    if (!entry) continue;
    if (entry.date < filters.from || entry.date > filters.to) continue;

    const acc = totals.get(tx.account_code) ?? { creditos: 0, debitos: 0 };
    if (tx.transaction_type === "entrada") acc.creditos += entry.value;
    else acc.debitos += entry.value;
    totals.set(tx.account_code, acc);
  }

  const round = (n: number) => Math.round(n * 100) / 100;

  return accounts
    .map((a) => {
      const t = totals.get(a.code) ?? { creditos: 0, debitos: 0 };
      const creditos = round(t.creditos);
      const debitos = round(t.debitos);
      return {
        ...a,
        creditos,
        debitos,
        saldo: round(creditos - debitos),
        has_movement: creditos !== 0 || debitos !== 0,
      };
    })
    .filter((r) => (filters.include_zero ? true : r.has_movement))
    .sort((a, b) => a.code.localeCompare(b.code));
}
