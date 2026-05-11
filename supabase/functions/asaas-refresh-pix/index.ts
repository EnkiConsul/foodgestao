// Refresh PIX QR code for an invoice
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { asaasFetch } from "../_shared/asaas.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
    const user = userData.user;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const body = await req.json().catch(() => ({}));
    const invoiceId: string | undefined = body.invoiceId;
    if (!invoiceId) return json({ error: "invoiceId required" }, 400);

    const { data: invoice, error: invErr } = await admin
      .from("invoices").select("*").eq("id", invoiceId).maybeSingle();
    if (invErr || !invoice) return json({ error: "Invoice not found" }, 404);
    if (invoice.user_id !== user.id) return json({ error: "Forbidden" }, 403);
    if (invoice.payment_method !== "pix") return json({ error: "Not a PIX invoice" }, 400);

    let paymentId = invoice.external_invoice_id as string | null;

    // If no payment yet, try fetch from the subscription
    if (!paymentId && invoice.subscription_id) {
      const { data: sub } = await admin
        .from("subscriptions").select("external_subscription_id")
        .eq("id", invoice.subscription_id).maybeSingle();
      if (sub?.external_subscription_id) {
        const payments = await asaasFetch(
          `/subscriptions/${sub.external_subscription_id}/payments`,
        ).catch(() => null);
        paymentId = payments?.data?.[0]?.id ?? null;
        if (paymentId) {
          await admin.from("invoices")
            .update({ external_invoice_id: paymentId })
            .eq("id", invoice.id);
        }
      }
    }
    if (!paymentId) {
      return json({
        error: "Esta fatura não está vinculada a um pagamento no Asaas. Refaça o checkout para gerar um novo QR Code.",
        code: "NO_EXTERNAL_PAYMENT",
      }, 400);
    }

    const qr = await asaasFetch(`/payments/${paymentId}/pixQrCode`);
    if (!qr?.encodedImage || !qr?.payload) {
      return json({ error: "Asaas did not return QR code" }, 502);
    }

    const { error: updErr } = await admin.from("invoices").update({
      pix_qrcode: qr.payload,
      pix_qrcode_image: qr.encodedImage,
    }).eq("id", invoice.id);
    if (updErr) throw updErr;

    return json({ ok: true });
  } catch (e) {
    console.error("asaas-refresh-pix error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return json({ error: msg }, 500);
  }
});
