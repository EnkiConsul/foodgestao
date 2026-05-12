// Refresh PIX QR code for an invoice
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { asaasFetch } from "../_shared/asaas.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export type InvoiceRow = {
  id: string;
  user_id: string;
  payment_method: string | null;
  external_invoice_id: string | null;
  subscription_id: string | null;
};

export type RefreshDeps = {
  getUserId: (authHeader: string) => Promise<string | null>;
  fetchInvoice: (id: string) => Promise<InvoiceRow | null>;
  fetchSubscriptionAsaasId: (subscriptionId: string) => Promise<string | null>;
  fetchFirstPaymentId: (asaasSubscriptionId: string) => Promise<string | null>;
  fetchPixQrCode: (paymentId: string) => Promise<{ encodedImage: string; payload: string } | null>;
  updateInvoicePix: (invoiceId: string, payload: string, encodedImage: string) => Promise<void>;
  updateInvoiceExternalId: (invoiceId: string, externalId: string) => Promise<void>;
};

export async function handleRefreshPix(req: Request, deps: RefreshDeps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userId = await deps.getUserId(authHeader);
    if (!userId) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const invoiceId: string | undefined = body.invoiceId;
    if (!invoiceId) return json({ error: "invoiceId required" }, 400);

    const invoice = await deps.fetchInvoice(invoiceId);
    if (!invoice) return json({ error: "Invoice not found" }, 404);
    if (invoice.user_id !== userId) return json({ error: "Forbidden" }, 403);
    if (invoice.payment_method !== "pix") return json({ error: "Not a PIX invoice" }, 400);

    let paymentId = invoice.external_invoice_id;

    if (!paymentId && invoice.subscription_id) {
      const asaasSubId = await deps.fetchSubscriptionAsaasId(invoice.subscription_id);
      if (asaasSubId) {
        paymentId = await deps.fetchFirstPaymentId(asaasSubId);
        if (paymentId) await deps.updateInvoiceExternalId(invoice.id, paymentId);
      }
    }

    if (!paymentId) {
      return json({
        error: "Esta fatura não está vinculada a um pagamento no Asaas. Refaça o checkout para gerar um novo QR Code.",
        code: "NO_EXTERNAL_PAYMENT",
      }, 400);
    }

    const qr = await deps.fetchPixQrCode(paymentId);
    if (!qr?.encodedImage || !qr?.payload) {
      return json({ error: "Asaas did not return QR code" }, 502);
    }

    await deps.updateInvoicePix(invoice.id, qr.payload, qr.encodedImage);
    return json({ ok: true });
  } catch (e) {
    console.error("asaas-refresh-pix error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return json({ error: msg }, 500);
  }
}

// ---- Production deps wiring ----
function buildProdDeps(): RefreshDeps {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  return {
    getUserId: async (authHeader) => {
      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data, error } = await userClient.auth.getUser();
      if (error || !data.user) return null;
      return data.user.id;
    },
    fetchInvoice: async (id) => {
      const { data } = await admin.from("invoices")
        .select("id,user_id,payment_method,external_invoice_id,subscription_id")
        .eq("id", id).maybeSingle();
      return (data as InvoiceRow | null) ?? null;
    },
    fetchSubscriptionAsaasId: async (subscriptionId) => {
      const { data } = await admin.from("subscriptions")
        .select("external_subscription_id").eq("id", subscriptionId).maybeSingle();
      return (data?.external_subscription_id as string | null) ?? null;
    },
    fetchFirstPaymentId: async (asaasSubId) => {
      const payments = await asaasFetch(`/subscriptions/${asaasSubId}/payments`).catch(() => null);
      return payments?.data?.[0]?.id ?? null;
    },
    fetchPixQrCode: async (paymentId) => {
      const qr = await asaasFetch(`/payments/${paymentId}/pixQrCode`);
      if (!qr?.encodedImage || !qr?.payload) return null;
      return { encodedImage: qr.encodedImage, payload: qr.payload };
    },
    updateInvoicePix: async (invoiceId, payload, encodedImage) => {
      const { error } = await admin.from("invoices").update({
        pix_qrcode: payload,
        pix_qrcode_image: encodedImage,
      }).eq("id", invoiceId);
      if (error) throw error;
    },
    updateInvoiceExternalId: async (invoiceId, externalId) => {
      await admin.from("invoices").update({ external_invoice_id: externalId }).eq("id", invoiceId);
    },
  };
}

if (import.meta.main) {
  const deps = buildProdDeps();
  Deno.serve((req) => handleRefreshPix(req, deps));
}
