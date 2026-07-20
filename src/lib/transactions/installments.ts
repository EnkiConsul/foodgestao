/**
 * Regras puras de parcelamento (`installments`) usadas ao criar um
 * lançamento parcelado. Reproduz a lógica hoje inline em
 * `src/components/transactions/TransactionFormDialog.tsx` para permitir
 * testes de regressão sem tocar o Supabase.
 *
 * Contrato:
 * - Sempre gera 1 âncora "parent" (status cancelado, não entra no saldo)
 *   com o valor total, e N filhas com `parent_transaction_id`.
 * - Modo "total": o usuário informou o valor total. Cada parcela =
 *   floor(total/N, 2 casas); o remainder acumulado vai para a ÚLTIMA parcela.
 * - Modo "parcela": o usuário informou o valor de cada parcela. Total = valor × N,
 *   sem remainder (mas a fórmula é homogênea).
 * - As datas seguem o período informado a partir de `startDate`.
 */

import { addDays, addWeeks, addMonths, addYears } from "date-fns";

export type InstallmentPeriod =
  | "diario"
  | "semanal"
  | "quinzenal"
  | "mensal"
  | "bimestral"
  | "trimestral"
  | "semestral"
  | "anual";

export type InstallmentMode = "total" | "parcela";

export function getNextRecurrenceDate(current: Date, period: string): Date {
  switch (period) {
    case "diario": return addDays(current, 1);
    case "semanal": return addWeeks(current, 1);
    case "quinzenal": return addWeeks(current, 2);
    case "mensal": return addMonths(current, 1);
    case "bimestral": return addMonths(current, 2);
    case "trimestral": return addMonths(current, 3);
    case "semestral": return addMonths(current, 6);
    case "anual": return addYears(current, 1);
    default: return addMonths(current, 1);
  }
}

export interface PlanInstallmentsInput {
  /** Valor digitado pelo usuário — total OU parcela, conforme `mode`. */
  inputAmount: number;
  installmentTotal: number;
  mode: InstallmentMode;
  period: InstallmentPeriod;
  /** Data de início (yyyy-MM-dd ou Date). */
  startDate: Date | string;
}

export interface PlannedChild {
  installment_number: number;
  amount: number;
  transaction_date: string;
  due_date: string;
}

export interface InstallmentPlan {
  totalAmount: number;
  baseParcel: number;
  remainder: number;
  parent: {
    amount: number;
    transaction_date: string;
    installment_total: number;
  };
  children: PlannedChild[];
}

function toYmd(d: Date): string {
  // Reproduce toISOString().split("T")[0] — UTC based, matching current behavior.
  return d.toISOString().split("T")[0];
}

function toDate(v: Date | string): Date {
  return v instanceof Date ? new Date(v.getTime()) : new Date(v);
}

/** Arredondamento de 2 casas por multiplicação inteira (evita drift binário). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export class InstallmentValidationError extends Error {}

export function planInstallments(input: PlanInstallmentsInput): InstallmentPlan {
  const { inputAmount, installmentTotal, mode, period, startDate } = input;

  if (!Number.isFinite(inputAmount) || inputAmount <= 0) {
    throw new InstallmentValidationError("Valor deve ser maior que zero");
  }
  if (!Number.isInteger(installmentTotal) || installmentTotal < 2) {
    throw new InstallmentValidationError("Nº de parcelas deve ser ≥ 2");
  }

  const totalAmount = mode === "total" ? inputAmount : round2(inputAmount * installmentTotal);
  const baseParcel = mode === "total"
    ? Math.floor((inputAmount / installmentTotal) * 100) / 100
    : inputAmount;
  const remainder = round2(totalAmount - baseParcel * installmentTotal);

  const dates: string[] = [];
  let cursor = toDate(startDate);
  for (let i = 0; i < installmentTotal; i++) {
    dates.push(toYmd(cursor));
    cursor = getNextRecurrenceDate(cursor, period);
  }

  const children: PlannedChild[] = dates.map((d, i) => {
    const isLast = i === installmentTotal - 1;
    const amount = isLast ? round2(baseParcel + remainder) : baseParcel;
    return {
      installment_number: i + 1,
      amount,
      transaction_date: d,
      due_date: d,
    };
  });

  return {
    totalAmount,
    baseParcel,
    remainder,
    parent: {
      amount: totalAmount,
      transaction_date: dates[0],
      installment_total: installmentTotal,
    },
    children,
  };
}

/**
 * Efeito de uma edição em série sobre as parcelas restantes.
 * Corresponde à decisão UI: aplicar mudança a "esta", "esta e próximas" ou "todas".
 */
export type EditScope = "single" | "forward" | "all";

export function selectAffectedChildren<T extends { installment_number: number | null }>(
  children: T[],
  target: T,
  scope: EditScope,
): T[] {
  if (scope === "all") return [...children];
  if (scope === "single") return [target];
  const targetNum = target.installment_number ?? 0;
  return children.filter((c) => (c.installment_number ?? 0) >= targetNum);
}

/**
 * Soma o efeito financeiro real de um conjunto de parcelas — usado para
 * validar recibos/totais após exclusões parciais.
 */
export function sumChildren(children: Pick<PlannedChild, "amount">[]): number {
  return round2(children.reduce((s, c) => s + c.amount, 0));
}
