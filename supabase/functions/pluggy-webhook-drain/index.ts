// Drain: cron a cada minuto que aciona o worker durável (pluggy-worker) para
// reprocessar eventos com next_attempt_at vencido ou leases expiradas. O
// processamento em si roda no worker via RPC pluggy_webhook_claim.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

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
  try {
    const resp = await fetch(`${url}/functions/v1/pluggy-worker`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-worker-secret": expected,
      },
      body: JSON.stringify({ batch: 10 }),
    });
    const body = await resp.json().catch(() => ({}));
    return json(resp.ok ? 200 : 502, { worker_status: resp.status, worker_response: body });
  } catch (err) {
    console.error("[pluggy-webhook-drain] worker invoke failed", err);
    return json(500, { error: "worker_invoke_failed", detail: String((err as Error)?.message ?? err) });
  }
});
