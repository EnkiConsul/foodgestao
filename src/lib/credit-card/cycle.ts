/**
 * Regras puras de ciclo de cartão de crédito.
 *
 * Aqui vive TODA a matemática de datas de fatura — resolução do dia efetivo
 * (meses de 28/30/31), alocação de uma compra à fatura correta, cálculo da
 * data de vencimento correspondente e derivação do mês de referência.
 *
 * Nenhuma dependência de Supabase ou React. É a fundação testável de toda a
 * Fase 1 do plano "Gestão de Cartão de Crédito".
 *
 * Convenções:
 * - `closing_day` e `due_day` são o DIA nominal escolhido pelo usuário (1–31).
 *   Ao materializar em data real, aplicamos `LEAST(day, days_in_month)`.
 * - Se `due_day <= closing_day`, o vencimento cai no mês SEGUINTE ao
 *   fechamento (é o comportamento padrão de emissores no Brasil).
 * - O mês de referência de uma fatura é o mês (dia 1) do seu `closing_date`.
 * - Todas as datas retornadas são objetos `Date` no fuso local à meia-noite;
 *   converter para yyyy-MM-dd via `toYmd`.
 */

export interface CycleConfig {
  /** Dia nominal de fechamento (1–31). */
  closingDay: number;
  /** Dia nominal de vencimento (1–31). */
  dueDay: number;
}

export class CycleValidationError extends Error {}

function assertDay(day: number, label: string): void {
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new CycleValidationError(`${label} deve ser um inteiro entre 1 e 31`);
  }
}

export function assertCycleConfig(cfg: CycleConfig): void {
  assertDay(cfg.closingDay, "closingDay");
  assertDay(cfg.dueDay, "dueDay");
}

/** Número de dias do mês (year, month 1-based). */
export function daysInMonth(year: number, month: number): number {
  // Truque clássico: dia 0 do mês seguinte = último dia deste mês.
  return new Date(year, month, 0).getDate();
}

/**
 * Resolve um dia nominal para uma data real dentro do mês, aplicando
 * `LEAST(day, days_in_month)`. Ex.: (2026, 2, 31) → 2026-02-28.
 */
export function resolveCycleDate(year: number, month: number, day: number): Date {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new CycleValidationError("year/month inválidos");
  }
  assertDay(day, "day");
  const effective = Math.min(day, daysInMonth(year, month));
  return new Date(year, month - 1, effective);
}

function addMonths(d: Date, delta: number): { year: number; month: number } {
  const total = d.getFullYear() * 12 + d.getMonth() + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

/**
 * Data de fechamento correspondente ao mês de uma data qualquer.
 */
export function closingDateOfMonth(year: number, month: number, cfg: CycleConfig): Date {
  assertCycleConfig(cfg);
  return resolveCycleDate(year, month, cfg.closingDay);
}

/**
 * Data de vencimento correspondente a um fechamento.
 * Regra: `dueDay > closingDay` → vence no MESMO mês do fechamento;
 *        `dueDay <= closingDay` → vence no mês SEGUINTE.
 */
export function dueDateForClosing(closing: Date, cfg: CycleConfig): Date {
  assertCycleConfig(cfg);
  const deltaMonths = cfg.dueDay > cfg.closingDay ? 0 : 1;
  const { year, month } = addMonths(closing, deltaMonths);
  return resolveCycleDate(year, month, cfg.dueDay);
}

export interface InvoiceCycle {
  /** Primeiro dia do mês de referência (chave lógica da fatura). */
  referenceMonth: Date;
  /** Primeiro dia do período coberto pela fatura (dia seguinte ao fechamento anterior). */
  periodStart: Date;
  closingDate: Date;
  dueDate: Date;
}

/**
 * Aloca uma compra à fatura correta.
 *
 * Regra: se `purchaseDate <= closingDate do mês da compra` → fatura corrente.
 * Caso contrário → fatura do mês seguinte. O `periodStart` sempre é o dia
 * seguinte ao fechamento anterior.
 */
export function assignPurchaseToInvoice(purchase: Date, cfg: CycleConfig): InvoiceCycle {
  assertCycleConfig(cfg);
  const y = purchase.getFullYear();
  const m = purchase.getMonth() + 1;

  const closingThisMonth = closingDateOfMonth(y, m, cfg);
  let closingDate: Date;
  if (purchase.getTime() <= closingThisMonth.getTime()) {
    closingDate = closingThisMonth;
  } else {
    const next = addMonths(purchase, 1);
    closingDate = closingDateOfMonth(next.year, next.month, cfg);
  }

  const prev = addMonths(closingDate, -1);
  const previousClosing = closingDateOfMonth(prev.year, prev.month, cfg);
  const periodStart = new Date(
    previousClosing.getFullYear(),
    previousClosing.getMonth(),
    previousClosing.getDate() + 1,
  );

  return {
    referenceMonth: new Date(closingDate.getFullYear(), closingDate.getMonth(), 1),
    periodStart,
    closingDate,
    dueDate: dueDateForClosing(closingDate, cfg),
  };
}

/**
 * Retorna a próxima fatura (a que sucede a informada).
 */
export function nextInvoice(current: InvoiceCycle, cfg: CycleConfig): InvoiceCycle {
  const { year, month } = addMonths(current.closingDate, 1);
  const closingDate = closingDateOfMonth(year, month, cfg);
  const periodStart = new Date(
    current.closingDate.getFullYear(),
    current.closingDate.getMonth(),
    current.closingDate.getDate() + 1,
  );
  return {
    referenceMonth: new Date(closingDate.getFullYear(), closingDate.getMonth(), 1),
    periodStart,
    closingDate,
    dueDate: dueDateForClosing(closingDate, cfg),
  };
}

/** Serializa uma Date local em yyyy-MM-dd. */
export function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
