// Drain: reprocessa eventos com status pending|retry cujo next_attempt_at já venceu.
// Chamado por pg_cron ou manualmente. Autenticação: PLUGGY_CRON_TICK_SECRET no header.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { processEvent } from "../pluggy-webhook/index.ts";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const expected = Deno.env.get("PLUGGY_CRON_TICK_SECRET");
  const provided = req.headers.get("x-cron-secret") ?? "";
  if (!expected || provided !== expected) return json(401, { error: "unauthenticated" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(url, service);

  const nowIso = new Date().toISOString();
  const { data: events } = await supabase
    .from("open_finance_webhook_events")
    .select("id, attempt_count, status, event_type, pluggy_item_id, payload")
    .in("status", ["pending", "retry"])
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
    .lt("attempt_count", 10)
    .order("created_at", { ascending: true })
    .limit(50);

  let processed = 0;
  for (const ev of events ?? []) {
    try {
      await processEvent(
        supabase,
        { id: (ev as any).id, attempt_count: (ev as any).attempt_count, status: (ev as any).status },
        (ev as any).payload,
        (ev as any).event_type,
        (ev as any).pluggy_item_id,
      );
      processed++;
    } catch (err) {
      console.error("[pluggy-webhook-drain] failure", err);
    }
  }

  return json(200, { processed, checked: events?.length ?? 0 });
});
