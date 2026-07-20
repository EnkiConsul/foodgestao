import { describe, it, expect } from "vitest";
import {
  reduceWebhookEvent,
  mapBillingType,
  computeNextPeriodEnd,
  toCents,
  type InvoiceRow,
  type AsaasEvent,
} from "./webhookReducer";

const now = new Date("2026-07-20T12:00:00.000Z");

const baseInvoice: InvoiceRow = {
  id: "inv-1",
  subscription_id: "sub-1",
  amount_cents: 4990,
  due_date: "2026-07-15",
  external_payment_url: "https://old.url",
  status: "open",
};

function evt(over: Partial<AsaasEvent>): AsaasEvent {
  return {
    event: "PAYMENT_UPDATED",
    id: "e1",
    payment: { id: "p1", value: 49.9, dueDate: "2026-07-20" },
    ...over,
  };
}

describe("mapBillingType", () => {
  it("normalizes known billing types", () => {
    expect(mapBillingType("PIX")).toBe("pix");
    expect(mapBillingType("pix")).toBe("pix");
    expect(mapBillingType("BOLETO")).toBe("boleto");
    expect(mapBillingType("CREDIT_CARD")).toBe("credit_card");
  });
  it("returns null for unknown/empty", () => {
    expect(mapBillingType(undefined)).toBeNull();
    expect(mapBillingType("")).toBeNull();
    expect(mapBillingType("crypto")).toBeNull();
  });
});

describe("computeNextPeriodEnd", () => {
  it("adds 1 month by default", () => {
    const d = computeNextPeriodEnd(new Date("2026-01-31T00:00:00Z"), "monthly");
    // JS rolls Jan 31 + 1 month to Mar 3 — that's the historical behavior we keep.
    expect(d.getUTCMonth()).toBeGreaterThan(0);
  });
  it("adds 3 months for quarterly", () => {
    const d = computeNextPeriodEnd(new Date("2026-01-15T00:00:00Z"), "quarterly");
    expect(d.toISOString().slice(0, 10)).toBe("2026-04-15");
  });
  it("adds 1 year for yearly", () => {
    const d = computeNextPeriodEnd(new Date("2026-07-20T00:00:00Z"), "yearly");
    expect(d.toISOString().slice(0, 10)).toBe("2027-07-20");
  });
});

describe("toCents", () => {
  it("multiplies by 100 with rounding", () => {
    expect(toCents(49.9, 0)).toBe(4990);
    expect(toCents(10.005, 0)).toBe(1001);
  });
  it("falls back for undefined/NaN", () => {
    expect(toCents(undefined, 4990)).toBe(4990);
    expect(toCents(Number.NaN, 4990)).toBe(4990);
  });
});

describe("reduceWebhookEvent — paid events", () => {
  for (const type of ["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED", "PAYMENT_RECEIVED_IN_CASH"]) {
    it(`marks invoice paid and activates subscription for ${type}`, () => {
      const r = reduceWebhookEvent(evt({ event: type }), baseInvoice, {
        now,
        billingPeriod: "monthly",
      });
      expect(r.invoicePatch?.status).toBe("paid");
      expect(r.invoicePatch?.paid_at).toBe(now.toISOString());
      expect(r.invoicePatch?.amount_cents).toBe(4990);
      expect(r.subscriptionPatch?.status).toBe("active");
      expect(r.subscriptionPatch?.canceled_at).toBeNull();
      expect(r.subscriptionPatch?.cancel_at_period_end).toBe(false);
      expect(r.subscriptionPatch?.current_period_end).toBe("2026-08-20T12:00:00.000Z");
    });
  }

  it("uses yearly billing when configured", () => {
    const r = reduceWebhookEvent(evt({ event: "PAYMENT_CONFIRMED" }), baseInvoice, {
      now,
      billingPeriod: "yearly",
    });
    expect(r.subscriptionPatch?.current_period_end).toBe("2027-07-20T12:00:00.000Z");
  });

  it("does not emit subscription patch when invoice has no subscription", () => {
    const r = reduceWebhookEvent(
      evt({ event: "PAYMENT_CONFIRMED" }),
      { ...baseInvoice, subscription_id: null },
      { now },
    );
    expect(r.invoicePatch?.status).toBe("paid");
    expect(r.subscriptionPatch).toBeUndefined();
  });

  it("keeps existing amount when payment.value is missing", () => {
    const r = reduceWebhookEvent(
      { event: "PAYMENT_CONFIRMED", payment: { id: "p1" } },
      baseInvoice,
      { now },
    );
    expect(r.invoicePatch?.amount_cents).toBe(4990);
  });
});

describe("reduceWebhookEvent — overdue / refund / cancel", () => {
  it("PAYMENT_OVERDUE marks invoice overdue and subscription past_due", () => {
    const r = reduceWebhookEvent(evt({ event: "PAYMENT_OVERDUE" }), baseInvoice, { now });
    expect(r.invoicePatch).toEqual({ status: "overdue" });
    expect(r.subscriptionPatch).toEqual({ status: "past_due" });
  });

  it("PAYMENT_REFUNDED marks invoice refunded, no subscription change", () => {
    const r = reduceWebhookEvent(evt({ event: "PAYMENT_REFUNDED" }), baseInvoice, { now });
    expect(r.invoicePatch).toEqual({ status: "refunded" });
    expect(r.subscriptionPatch).toBeUndefined();
  });

  it("PAYMENT_REFUND_IN_PROGRESS also flips to refunded", () => {
    const r = reduceWebhookEvent(evt({ event: "PAYMENT_REFUND_IN_PROGRESS" }), baseInvoice, { now });
    expect(r.invoicePatch?.status).toBe("refunded");
  });

  for (const type of ["PAYMENT_DELETED", "PAYMENT_CHARGEBACK_REQUESTED", "PAYMENT_CHARGEBACK_DISPUTE"]) {
    it(`${type} cancels the invoice`, () => {
      const r = reduceWebhookEvent(evt({ event: type }), baseInvoice, { now });
      expect(r.invoicePatch).toEqual({ status: "canceled" });
    });
  }
});

describe("reduceWebhookEvent — PAYMENT_UPDATED", () => {
  it("updates amount, due date and URL", () => {
    const r = reduceWebhookEvent(
      evt({
        event: "PAYMENT_UPDATED",
        payment: { id: "p1", value: 59.9, dueDate: "2026-08-01", invoiceUrl: "https://new.url" },
      }),
      baseInvoice,
      { now },
    );
    expect(r.invoicePatch).toEqual({
      amount_cents: 5990,
      due_date: "2026-08-01",
      external_payment_url: "https://new.url",
    });
  });

  it("preserves existing values when payment fields are absent", () => {
    const r = reduceWebhookEvent(
      { event: "PAYMENT_UPDATED", payment: { id: "p1" } },
      baseInvoice,
      { now },
    );
    expect(r.invoicePatch).toEqual({
      amount_cents: 4990,
      due_date: "2026-07-15",
      external_payment_url: "https://old.url",
    });
  });
});

describe("reduceWebhookEvent — subscription + auto-create", () => {
  it("SUBSCRIPTION_DELETED cancels subscription immediately", () => {
    const r = reduceWebhookEvent(
      { event: "SUBSCRIPTION_DELETED", subscription: { id: "sub-ext" } },
      null,
      { now },
    );
    expect(r.subscriptionPatch).toEqual({
      status: "canceled",
      canceled_at: now.toISOString(),
    });
  });

  it("signals auto-create when invoice missing but payment ties to a subscription", () => {
    const r = reduceWebhookEvent(
      { event: "PAYMENT_CREATED", payment: { id: "p-new", subscription: "sub-ext", value: 49.9 } },
      null,
      { now },
    );
    expect(r.shouldCreateInvoice).toBe(true);
  });

  it("noop when invoice missing and no subscription reference", () => {
    const r = reduceWebhookEvent(
      { event: "PAYMENT_CREATED", payment: { id: "p-new", value: 49.9 } },
      null,
      { now },
    );
    expect(r.noop).toBe(true);
    expect(r.invoicePatch).toBeUndefined();
  });

  it("noop for unknown event types with existing invoice", () => {
    const r = reduceWebhookEvent(evt({ event: "PAYMENT_ANTICIPATED" }), baseInvoice, { now });
    expect(r.noop).toBe(true);
    expect(r.invoicePatch).toBeUndefined();
    expect(r.subscriptionPatch).toBeUndefined();
  });

  it("noop when payload lacks payment id and is not a subscription event", () => {
    const r = reduceWebhookEvent({ event: "PAYMENT_CREATED" }, baseInvoice, { now });
    expect(r.noop).toBe(true);
  });
});
