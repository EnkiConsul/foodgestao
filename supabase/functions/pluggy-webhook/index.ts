// Receives Pluggy webhook events (item/updated, item/error, transactions/created, item/waiting_user_input, etc.).
// Persists each event in open_finance_webhook_events and enqueues an open_finance_sync_runs row
// when the event indicates new data is available. verify_jwt = false (Pluggy calls us).
// Security: validates optional shared secret header PLUGGY_WEBHOOK_SECRET when configured.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const expectedSecret = Deno.env.get("PLUGGY_WEBHOOK_SECRET");
  if (expectedSecret) {
    const provided = req.headers.get("x-pluggy-signature") ?? req.headers.get("x-webhook-secret");
    if (provided !== expectedSecret) {
      console.warn("[pluggy-webhook] rejected: bad signature");
      return json(401, { error: "invalid_signature" });
    }
  }

  let payload: any;
  try { payload = await req.json(); }
  catch { return json(400, { error: "invalid_json" }); }

  const eventType: string = payload?.event ?? payload?.eventType ?? "unknown";
  const pluggyItemId: string | null = payload?.itemId ?? payload?.item?.id ?? null;

  const url = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(url, service);

  await supabase.from("open_finance_webhook_events").insert({
    event_type: eventType,
    pluggy_item_id: pluggyItemId,
    payload,
  });

  // Locate the connection (if any) and enqueue a sync for data-changing events.
  const dataChangingEvents = new Set([
    "item/updated",
    "item/created",
    "transactions/created",
    "transactions/updated",
    "transactions/deleted",
  ]);

  if (pluggyItemId && dataChangingEvents.has(eventType)) {
    const { data: conn } = await supabase
      .from("open_finance_connections")
      .select("id, company_id")
      .eq("pluggy_item_id", pluggyItemId)
      .maybeSingle();
    if (conn) {
      await supabase.from("open_finance_sync_runs").insert({
        connection_id: conn.id,
        company_id: conn.company_id,
        status: "queued",
        triggered_by: `webhook:${eventType}`,
      });
    }
  }

  // Update connection status/consent on error/updated events
  if (pluggyItemId && (eventType === "item/updated" || eventType === "item/error" || eventType === "item/waiting_user_input")) {
    const patch: Record<string, unknown> = {
      status: payload?.item?.status ?? payload?.status ?? undefined,
      status_detail: payload?.item?.executionStatus ?? undefined,
      consent_expires_at: payload?.item?.consentExpiresAt ?? undefined,
    };
    // remove undefined
    for (const k of Object.keys(patch)) if (patch[k] === undefined) delete patch[k];
    if (Object.keys(patch).length) {
      await supabase
        .from("open_finance_connections")
        .update(patch)
        .eq("pluggy_item_id", pluggyItemId);
    }
  }

  return json(200, { received: true });
});
