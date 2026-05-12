// Tests for asaas-refresh-pix edge function
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleRefreshPix, type InvoiceRow, type RefreshDeps } from "./index.ts";

function makeReq(body: unknown, auth = "Bearer test-token"): Request {
  return new Request("http://localhost/asaas-refresh-pix", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: auth },
    body: JSON.stringify(body),
  });
}

const TEST_USER = "user-1";
const ORPHAN_INVOICE: InvoiceRow = {
  id: "inv-1",
  user_id: TEST_USER,
  payment_method: "pix",
  external_invoice_id: null,
  subscription_id: null,
};

function baseDeps(overrides: Partial<RefreshDeps> = {}): RefreshDeps {
  return {
    getUserId: async () => TEST_USER,
    fetchInvoice: async () => ORPHAN_INVOICE,
    fetchSubscriptionAsaasId: async () => null,
    fetchFirstPaymentId: async () => null,
    fetchPixQrCode: async () => ({ encodedImage: "img", payload: "pl" }),
    updateInvoicePix: async () => {},
    updateInvoiceExternalId: async () => {},
    ...overrides,
  };
}

Deno.test("returns 400 NO_EXTERNAL_PAYMENT when invoice has no external_invoice_id and no subscription", async () => {
  const res = await handleRefreshPix(makeReq({ invoiceId: "inv-1" }), baseDeps());
  assertEquals(res.status, 400);
  const json = await res.json();
  assertEquals(json.code, "NO_EXTERNAL_PAYMENT");
  assertEquals(
    json.error,
    "Esta fatura não está vinculada a um pagamento no Asaas. Refaça o checkout para gerar um novo QR Code.",
  );
});

Deno.test("returns 400 NO_EXTERNAL_PAYMENT when subscription has no asaas id", async () => {
  const deps = baseDeps({
    fetchInvoice: async () => ({ ...ORPHAN_INVOICE, subscription_id: "sub-1" }),
    fetchSubscriptionAsaasId: async () => null,
  });
  const res = await handleRefreshPix(makeReq({ invoiceId: "inv-1" }), deps);
  assertEquals(res.status, 400);
  const json = await res.json();
  assertEquals(json.code, "NO_EXTERNAL_PAYMENT");
});

Deno.test("returns 400 NO_EXTERNAL_PAYMENT when asaas subscription has no payments", async () => {
  const deps = baseDeps({
    fetchInvoice: async () => ({ ...ORPHAN_INVOICE, subscription_id: "sub-1" }),
    fetchSubscriptionAsaasId: async () => "asaas-sub-1",
    fetchFirstPaymentId: async () => null,
  });
  const res = await handleRefreshPix(makeReq({ invoiceId: "inv-1" }), deps);
  assertEquals(res.status, 400);
  const json = await res.json();
  assertEquals(json.code, "NO_EXTERNAL_PAYMENT");
});

Deno.test("returns 401 when not authenticated", async () => {
  const res = await handleRefreshPix(makeReq({ invoiceId: "inv-1" }), baseDeps({ getUserId: async () => null }));
  assertEquals(res.status, 401);
  await res.json();
});

Deno.test("returns 400 when invoiceId is missing", async () => {
  const res = await handleRefreshPix(makeReq({}), baseDeps());
  assertEquals(res.status, 400);
  const json = await res.json();
  assertEquals(json.error, "invoiceId required");
});

Deno.test("returns 404 when invoice not found", async () => {
  const res = await handleRefreshPix(
    makeReq({ invoiceId: "missing" }),
    baseDeps({ fetchInvoice: async () => null }),
  );
  assertEquals(res.status, 404);
  await res.json();
});

Deno.test("returns 403 when invoice belongs to another user", async () => {
  const res = await handleRefreshPix(
    makeReq({ invoiceId: "inv-1" }),
    baseDeps({ fetchInvoice: async () => ({ ...ORPHAN_INVOICE, user_id: "other-user" }) }),
  );
  assertEquals(res.status, 403);
  await res.json();
});

Deno.test("succeeds when external_invoice_id is set and Asaas returns QR", async () => {
  let pixUpdated = false;
  const deps = baseDeps({
    fetchInvoice: async () => ({ ...ORPHAN_INVOICE, external_invoice_id: "pay-1" }),
    updateInvoicePix: async () => { pixUpdated = true; },
  });
  const res = await handleRefreshPix(makeReq({ invoiceId: "inv-1" }), deps);
  assertEquals(res.status, 200);
  const json = await res.json();
  assertEquals(json.ok, true);
  assertEquals(pixUpdated, true);
});

Deno.test("backfills external_invoice_id via subscription when missing", async () => {
  let backfilled: string | null = null;
  const deps = baseDeps({
    fetchInvoice: async () => ({ ...ORPHAN_INVOICE, subscription_id: "sub-1" }),
    fetchSubscriptionAsaasId: async () => "asaas-sub-1",
    fetchFirstPaymentId: async () => "pay-99",
    updateInvoiceExternalId: async (_id, externalId) => { backfilled = externalId; },
  });
  const res = await handleRefreshPix(makeReq({ invoiceId: "inv-1" }), deps);
  assertEquals(res.status, 200);
  await res.json();
  assertEquals(backfilled, "pay-99");
});
