// supabase/functions/asaas-webhook-test/index.ts
// Super-admin-only: posts a synthetic Asaas event to the asaas-webhook endpoint
// using the configured ASAAS_WEBHOOK_TOKEN. Used by the admin "Test Webhook" UI.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user?.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: isAdmin } = await admin.rpc("is_super_admin", { _user_id: userData.user.id });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const eventType: string = body.eventType ?? "PAYMENT_CONFIRMED";
    const paymentId: string | null = body.paymentId ?? null;
    const subscriptionId: string | null = body.subscriptionId ?? null;
    const duplicateOf: string | null = body.duplicateOf ?? null;

    const eventId = duplicateOf ?? `evt_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const payload: Record<string, unknown> = {
      id: eventId,
      event: eventType,
      dateCreated: new Date().toISOString(),
    };

    if (eventType.startsWith("PAYMENT_")) {
      payload.payment = {
        id: paymentId ?? `pay_test_${Date.now()}`,
        status: eventType === "PAYMENT_CONFIRMED" || eventType === "PAYMENT_RECEIVED" ? "RECEIVED" : "PENDING",
        value: 9990,
        billingType: "PIX",
        dueDate: new Date().toISOString().slice(0, 10),
        customer: "cus_test",
        subscription: subscriptionId,
      };
    }
    if (eventType.startsWith("SUBSCRIPTION_")) {
      payload.subscription = {
        id: subscriptionId ?? `sub_test_${Date.now()}`,
        status: eventType === "SUBSCRIPTION_DELETED" ? "INACTIVE" : "ACTIVE",
      };
    }

    const token = Deno.env.get("ASAAS_WEBHOOK_TOKEN") ?? "";
    if (!token) {
      return new Response(JSON.stringify({ error: "ASAAS_WEBHOOK_TOKEN not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const webhookUrl = `${SUPABASE_URL}/functions/v1/asaas-webhook`;
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "asaas-access-token": token,
      },
      body: JSON.stringify(payload),
    });
    const responseText = await res.text();
    let parsed: unknown = responseText;
    try { parsed = JSON.parse(responseText); } catch { /* keep text */ }

    return new Response(JSON.stringify({
      ok: res.ok,
      status: res.status,
      eventId,
      eventType,
      sentPayload: payload,
      webhookResponse: parsed,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("asaas-webhook-test error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
