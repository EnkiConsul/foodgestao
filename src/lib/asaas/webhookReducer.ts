/**
 * Pure reducer for Asaas webhook events.
 *
 * Given an event + current invoice state, returns the patches that should be
 * applied to `invoices` and `subscriptions`. Extracted from the edge function
 * so we can unit-test the state machine without hitting Supabase.
 *
 * The edge function itself remains the source of truth for I/O; keep the
 * transition rules here in sync with `supabase/functions/asaas-webhook/index.ts`.
 */

export type BillingPeriod = "monthly" | "quarterly" | "yearly";

export type InvoiceStatus =
  | "open"
  | "paid"
  | "overdue"
  | "refunded"
  | "canceled";

export type PaymentMethod = "pix" | "boleto" | "credit_card";

export interface AsaasPayment {
  id: string;
  value?: number;
  dueDate?: string;
  invoiceUrl?: string | null;
  subscription?: string | null;
  billingType?: string | null;
}

export interface AsaasEvent {
  event: string;
  id?: string;
  payment?: AsaasPayment | null;
  subscription?: { id: string } | null;
}

export interface InvoiceRow {
  id: string;
  subscription_id: string | null;
  amount_cents: number;
  due_date: string;
  external_payment_url: string | null;
  status: InvoiceStatus;
}

export interface InvoicePatch {
  status?: InvoiceStatus;
  paid_at?: string;
  amount_cents?: number;
  due_date?: string;
  external_payment_url?: string | null;
}

export interface SubscriptionPatch {
  status?: "active" | "past_due" | "canceled";
  current_period_start?: string;
  current_period_end?: string;
  canceled_at?: string | null;
  cancel_at_period_end?: boolean;
}

export interface ReducerResult {
  invoicePatch?: InvoicePatch;
  subscriptionPatch?: SubscriptionPatch;
  /** Absent invoice + subscription payment => caller should auto-create. */
  shouldCreateInvoice?: boolean;
  /** Handled but no DB change (unknown/no-op event). */
  noop?: boolean;
}

const PAID_EVENTS = new Set([
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED",
  "PAYMENT_RECEIVED_IN_CASH",
]);

const REFUND_EVENTS = new Set([
  "PAYMENT_REFUNDED",
  "PAYMENT_REFUND_IN_PROGRESS",
]);

const CANCEL_EVENTS = new Set([
  "PAYMENT_DELETED",
  "PAYMENT_CHARGEBACK_REQUESTED",
  "PAYMENT_CHARGEBACK_DISPUTE",
]);

export function mapBillingType(billingType?: string | null): PaymentMethod | null {
  const up = (billingType ?? "").toUpperCase();
  if (up === "PIX") return "pix";
  if (up === "BOLETO") return "boleto";
  if (up === "CREDIT_CARD") return "credit_card";
  return null;
}

export function computeNextPeriodEnd(
  from: Date,
  period: BillingPeriod,
): Date {
  const end = new Date(from.getTime());
  if (period === "yearly") end.setFullYear(end.getFullYear() + 1);
  else if (period === "quarterly") end.setMonth(end.getMonth() + 3);
  else end.setMonth(end.getMonth() + 1);
  return end;
}

export function toCents(value: number | undefined, fallbackCents: number): number {
  if (value == null || Number.isNaN(Number(value))) return fallbackCents;
  return Math.round(Number(value) * 100);
}

export interface ReducerContext {
  now: Date;
  billingPeriod?: BillingPeriod;
}

export function reduceWebhookEvent(
  event: AsaasEvent,
  invoice: InvoiceRow | null,
  ctx: ReducerContext,
): ReducerResult {
  const type = event.event;
  const payment = event.payment ?? null;

  // Subscription-level events
  if (event.subscription?.id && type === "SUBSCRIPTION_DELETED") {
    return {
      subscriptionPatch: {
        status: "canceled",
        canceled_at: ctx.now.toISOString(),
      },
    };
  }

  if (!payment?.id) return { noop: true };

  // No local invoice yet but Asaas references a subscription => create.
  if (!invoice) {
    if (payment.subscription) return { shouldCreateInvoice: true };
    return { noop: true };
  }

  if (PAID_EVENTS.has(type)) {
    const nowIso = ctx.now.toISOString();
    const patch: InvoicePatch = {
      status: "paid",
      paid_at: nowIso,
      amount_cents: toCents(payment.value, invoice.amount_cents),
    };
    let subPatch: SubscriptionPatch | undefined;
    if (invoice.subscription_id) {
      const period = ctx.billingPeriod ?? "monthly";
      subPatch = {
        status: "active",
        current_period_start: nowIso,
        current_period_end: computeNextPeriodEnd(ctx.now, period).toISOString(),
        canceled_at: null,
        cancel_at_period_end: false,
      };
    }
    return { invoicePatch: patch, subscriptionPatch: subPatch };
  }

  if (type === "PAYMENT_OVERDUE") {
    return {
      invoicePatch: { status: "overdue" },
      subscriptionPatch: invoice.subscription_id ? { status: "past_due" } : undefined,
    };
  }

  if (REFUND_EVENTS.has(type)) {
    return { invoicePatch: { status: "refunded" } };
  }

  if (CANCEL_EVENTS.has(type)) {
    return { invoicePatch: { status: "canceled" } };
  }

  if (type === "PAYMENT_UPDATED") {
    return {
      invoicePatch: {
        amount_cents: toCents(payment.value, invoice.amount_cents),
        due_date: payment.dueDate ?? invoice.due_date,
        external_payment_url: payment.invoiceUrl ?? invoice.external_payment_url,
      },
    };
  }

  return { noop: true };
}
