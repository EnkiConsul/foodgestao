// supabase/functions/asaas-webhook/index.ts
// Public endpoint (verify_jwt = false). Validates asaas-access-token header.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, asaas-access-token",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const expectedToken = Deno.env.get("ASAAS_WEBHOOK_TOKEN") ?? "";
    const receivedToken = req.headers.get("asaas-access-token") ?? "";
    if (!expectedToken || receivedToken !== expectedToken) {
      console.warn("Invalid webhook token");
      return new Response("Forbidden", { status: 403, headers: corsHeaders });
    }

    const payload = await req.json();
    const eventType: string = payload.event ?? "UNKNOWN";
    const eventId: string = payload.id ?? `${eventType}-${Date.now()}-${Math.random()}`;
    const payment = payload.payment ?? null;
    const subscription = payload.subscription ?? null;

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Idempotency
    const { data: existing } = await admin
      .from("asaas_webhook_events").select("id, processed_at").eq("event_id", eventId).maybeSingle();
    if (existing?.processed_at) {
      return new Response(JSON.stringify({ ok: true, deduped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!existing) {
      await admin.from("asaas_webhook_events").insert({
        event_id: eventId, event_type: eventType, payload,
      });
    }

    try {
      if (payment?.id) {
        const { data: inv } = await admin
          .from("invoices").select("*")
          .eq("external_invoice_id", payment.id).maybeSingle();

        if (inv) {
          if (["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED", "PAYMENT_RECEIVED_IN_CASH"].includes(eventType)) {
            const nowIso = new Date().toISOString();
            await admin.from("invoices").update({
              status: "paid",
              paid_at: nowIso,
            }).eq("id", inv.id);
            if (inv.subscription_id) {
              // Fetch subscription + plan to compute new period end
              const { data: sub } = await admin
                .from("subscriptions")
                .select("id, plan:plans(billing_period)")
                .eq("id", inv.subscription_id)
                .maybeSingle();
              const period = (sub?.plan as any)?.billing_period ?? "monthly";
              const nextEnd = new Date();
              if (period === "yearly") nextEnd.setFullYear(nextEnd.getFullYear() + 1);
              else if (period === "quarterly") nextEnd.setMonth(nextEnd.getMonth() + 3);
              else nextEnd.setMonth(nextEnd.getMonth() + 1);
              await admin.from("subscriptions").update({
                status: "active",
                current_period_start: nowIso,
                current_period_end: nextEnd.toISOString(),
                canceled_at: null,
                cancel_at_period_end: false,
              }).eq("id", inv.subscription_id);
            }
          } else if (eventType === "PAYMENT_OVERDUE") {
            await admin.from("invoices").update({ status: "overdue" }).eq("id", inv.id);
            if (inv.subscription_id) {
              await admin.from("subscriptions").update({ status: "past_due" })
                .eq("id", inv.subscription_id);
            }
          } else if (["PAYMENT_REFUNDED", "PAYMENT_REFUND_IN_PROGRESS"].includes(eventType)) {
            await admin.from("invoices").update({ status: "refunded" }).eq("id", inv.id);
          } else if (["PAYMENT_DELETED", "PAYMENT_CHARGEBACK_REQUESTED", "PAYMENT_CHARGEBACK_DISPUTE"].includes(eventType)) {
            await admin.from("invoices").update({ status: "canceled" }).eq("id", inv.id);
          }
        }
      }

      if (subscription?.id && eventType === "SUBSCRIPTION_DELETED") {
        await admin.from("subscriptions").update({
          status: "canceled", canceled_at: new Date().toISOString(),
        }).eq("external_subscription_id", subscription.id);
      }

      await admin.from("asaas_webhook_events")
        .update({ processed_at: new Date().toISOString() }).eq("event_id", eventId);
    } catch (procErr) {
      const msg = procErr instanceof Error ? procErr.message : String(procErr);
      console.error("webhook processing error:", msg);
      await admin.from("asaas_webhook_events")
        .update({ error: msg }).eq("event_id", eventId);
      // Still return 200 to avoid Asaas retry storm — error is logged.
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("asaas-webhook fatal:", e);
    return new Response(JSON.stringify({ error: "internal" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
