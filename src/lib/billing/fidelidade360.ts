/**
 * Programa Fidelidade 360 — calendário promocional controlado pelo 360° Food.
 *
 * Regra: ciclo de 12 meses. Mês 1 é cortesia de boas-vindas; a cada 3
 * mensalidades efetivamente pagas em dia, a próxima mensalidade é gratuita
 * (meses 5 e 9). Meses gratuitos geram fatura de R$ 0,00 com o desconto
 * explícito, para o benefício ficar visível no histórico do cliente.
 */

export const FIDELIDADE_CYCLE_MONTHS = 12;
export const FIDELIDADE_INSTALLMENTS = 9;
export const FIDELIDADE_FREE_MONTHS = [1, 5, 9] as const;

export type BillingVariant = "monthly_flex" | "fidelidade360";

/** Mês gratuito? O benefício dos meses 5 e 9 exige as 3 mensalidades anteriores pagas. */
export function isFreeMonth(cycleMonth: number, paidMonths: number): boolean {
  if (cycleMonth === 1) return true;
  if (cycleMonth === 5) return paidMonths >= 3;
  if (cycleMonth === 9) return paidMonths >= 6;
  return false;
}

/** Próximo mês de cortesia previsto a partir do mês atual do ciclo. */
export function nextFreeMonth(cycleMonth: number): number | null {
  if (cycleMonth < 5) return 5;
  if (cycleMonth < 9) return 9;
  return null;
}

/** Total efetivamente pago em 12 meses (9 mensalidades). */
export function annualTotalCents(monthlyCents: number): number {
  return monthlyCents * FIDELIDADE_INSTALLMENTS;
}

/** Economia anual (3 mensalidades gratuitas). */
export function annualSavingsCents(monthlyCents: number): number {
  return monthlyCents * (FIDELIDADE_CYCLE_MONTHS - FIDELIDADE_INSTALLMENTS);
}

/** Receita média mensal efetiva no ciclo de 12 meses. */
export function effectiveMonthlyCents(monthlyCents: number): number {
  return Math.round(annualTotalCents(monthlyCents) / FIDELIDADE_CYCLE_MONTHS);
}

export type CycleRow = {
  month: number;
  charged: boolean;
  amountCents: number;
  situacao: string;
};

/** Linha do tempo dos 12 meses, assumindo pagamentos em dia. */
export function buildCycleTimeline(monthlyCents: number): CycleRow[] {
  return Array.from({ length: FIDELIDADE_CYCLE_MONTHS }, (_, i) => {
    const month = i + 1;
    const free = (FIDELIDADE_FREE_MONTHS as readonly number[]).includes(month);
    return {
      month,
      charged: !free,
      amountCents: free ? 0 : monthlyCents,
      situacao: month === 1 ? "Ativo — cortesia" : free ? "Ativo — benefício" : "Ativo",
    };
  });
}

/** Data da primeira cobrança: 30 dias após a contratação. */
export function firstChargeDate(from: Date = new Date()): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + 30);
  return d;
}

export const formatDateBR = (d: Date) => d.toLocaleDateString("pt-BR");

/** Régua de inadimplência aplicada quando o cartão é recusado. */
export const DUNNING_STEPS = [
  { day: 0, label: "Dia do vencimento", action: "Primeira tentativa de cobrança" },
  { day: 1, label: "1 dia depois", action: "Nova tentativa e aviso por WhatsApp" },
  { day: 3, label: "3 dias depois", action: "Nova tentativa" },
  { day: 5, label: "5 dias depois", action: "Aviso de risco de suspensão" },
  { day: 7, label: "7 dias depois", action: "Suspensão parcial do acesso" },
] as const;
