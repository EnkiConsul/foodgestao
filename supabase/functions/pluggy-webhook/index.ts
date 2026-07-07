import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/pluggy.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const eventType = String(payload.event ?? payload.eventType ?? "unknown");
  const itemId = (payload.itemId ?? (payload.item as { id?: string } | undefined)?.id ?? null) as
    | string
    | null;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: eventRow } = await admin
    .from("pluggy_webhook_events")
    .insert({ event_type: eventType, item_id: itemId, payload })
    .select("id")
    .single();

  // Aciona sync automático quando aplicável
  const shouldSync = /transactions|item\/updated|updated/i.test(eventType);
  if (shouldSync && itemId) {
    try {
      const { data: conn } = await admin
        .from("bank_connections")
        .select("id")
        .eq("provider", "pluggy")
        .eq("provider_item_id", itemId)
        .maybeSingle();
      if (conn) {
        const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/pluggy-sync-connection`;
        await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ connectionId: conn.id }),
        }).catch((e) => console.warn("[pluggy-webhook] sync trigger", e));
      }
    } catch (e) {
      console.warn("[pluggy-webhook] lookup", e);
    }
  }

  if (eventRow?.id) {
    await admin
      .from("pluggy_webhook_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("id", eventRow.id);
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
