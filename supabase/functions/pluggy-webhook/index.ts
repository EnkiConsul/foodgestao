// Receiver lean: valida assinatura, persiste o evento e dispara o worker
// (fire-and-forget). Toda a lógica de materialização/sync roda no worker
// durável (pluggy-worker), com retry pelo cron pluggy-webhook-drain.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// deno-lint-ignore no-explicit-any
declare const EdgeRuntime: any;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function triggerWorker() {
  const url = Deno.env.get("SUPABASE_URL");
  const secret = Deno.env.get("PLUGGY_CRON_TICK_SECRET");
  if (!url || !secret) return;
  try {
    await fetch(`${url}/functions/v1/pluggy-worker`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-worker-secret": secret,
      },
      body: JSON.stringify({ batch: 5 }),
    });
  } catch (err) {
    console.warn("[pluggy-webhook] worker trigger failed (cron will retry)", err);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const rawBody = await req.text();

  const sharedSecret = Deno.env.get("PLUGGY_WEBHOOK_SECRET");
  const hmacSecret = Deno.env.get("PLUGGY_WEBHOOK_HMAC_SECRET");
  const providedSig = req.headers.get("x-pluggy-signature") ?? req.headers.get("x-webhook-secret") ?? "";

  if (hmacSecret) {
    const expected = await hmacSha256Hex(hmacSecret, rawBody);
    if (!timingSafeEqual(expected, providedSig.replace(/^sha256=/, ""))) {
      return json(401, { error: "invalid_signature" });
    }
  } else if (sharedSecret) {
    if (!timingSafeEqual(sharedSecret, providedSig)) {
      return json(401, { error: "invalid_signature" });
    }
  }

  let payload: Record<string, unknown>;
  try { payload = JSON.parse(rawBody); }
  catch { return json(400, { error: "invalid_json" }); }

  const eventType = String((payload as any)?.event ?? (payload as any)?.eventType ?? "unknown");
  const pluggyItemId: string | null =
    (payload as any)?.itemId ?? (payload as any)?.item?.id ?? null;

  const providedEventId =
    (payload as any)?.id ?? (payload as any)?.eventId ?? (payload as any)?.event_id ?? null;
  const eventId = providedEventId ? String(providedEventId) : `sha256:${await sha256Hex(rawBody)}`;

  const receivedIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("cf-connecting-ip") ??
    null;

  const url = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(url, service);

  const { error: insertErr } = await supabase
    .from("open_finance_webhook_events")
    .insert({
      event_id: eventId,
      event_type: eventType,
      pluggy_item_id: pluggyItemId,
      signature: providedSig || null,
      payload,
      received_ip: receivedIp,
      status: "pending",
    });

  if (insertErr) {
    if ((insertErr as { code?: string }).code === "23505") {
      return json(200, { received: true, duplicate: true });
    }
    console.error("[pluggy-webhook] insert error", insertErr);
    return json(500, { error: "persist_failed" });
  }

  // Dispara o worker sem bloquear a resposta ao Pluggy.
  const bg = triggerWorker();
  if (typeof EdgeRuntime !== "undefined" && typeof EdgeRuntime.waitUntil === "function") {
    EdgeRuntime.waitUntil(bg);
  }

  return json(200, { received: true, event_id: eventId });
});
