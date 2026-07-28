// Receiver fail-closed: exige o header X-360FOOD-WEBHOOK-TOKEN configurado
// no webhook da Pluggy. Sem PLUGGY_WEBHOOK_TOKEN no ambiente ou sem header
// válido, nenhuma linha é persistida e nenhum worker é acionado.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// deno-lint-ignore no-explicit-any
declare const EdgeRuntime: any;

const WEBHOOK_HEADER = "x-360food-webhook-token";

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

function timingSafeEqualText(expected: string, provided: string): boolean {
  const enc = new TextEncoder();
  const a = enc.encode(expected);
  const b = enc.encode(provided);
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a[i] ^ b[i];
  return out === 0;
}

function readToken(): { current: string | null; previous: string | null } {
  const norm = (v: string | undefined) => {
    const s = (v ?? "").trim();
    return s.length > 0 ? s : null;
  };
  return {
    current: norm(Deno.env.get("PLUGGY_WEBHOOK_TOKEN")),
    previous: norm(Deno.env.get("PLUGGY_WEBHOOK_TOKEN_PREVIOUS")),
  };
}

async function triggerWorker() {
  const url = Deno.env.get("SUPABASE_URL");
  const secret = Deno.env.get("PLUGGY_CRON_TICK_SECRET");
  if (!url || !secret) return;
  try {
    await fetch(`${url}/functions/v1/pluggy-worker`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-worker-secret": secret },
      body: JSON.stringify({ batch: 5 }),
    });
  } catch (_err) {
    console.warn("[pluggy-webhook] worker trigger failed (cron will retry)");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  // 1) Confirmar que o secret está configurado no servidor. Fail-closed.
  const { current, previous } = readToken();
  if (!current) {
    console.error("[pluggy-webhook] webhook_auth_not_configured");
    return json(500, { error: "webhook_auth_not_configured" });
  }

  // 2) Ler header canônico. Sem fallback para signature/authorization/query.
  const provided = (req.headers.get(WEBHOOK_HEADER) ?? "").trim();
  if (!provided) {
    console.warn("[pluggy-webhook] webhook_auth_failed");
    return json(401, { error: "invalid_webhook_token" });
  }

  const matchesCurrent = timingSafeEqualText(current, provided);
  const matchesPrevious = previous ? timingSafeEqualText(previous, provided) : false;
  if (!matchesCurrent && !matchesPrevious) {
    console.warn("[pluggy-webhook] webhook_auth_failed");
    return json(401, { error: "invalid_webhook_token" });
  }
  if (matchesPrevious && !matchesCurrent) {
    console.warn("[pluggy-webhook] webhook_authenticated previous_token_used");
  }

  // 3) Content-Type + body
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.toLowerCase().includes("application/json")) {
    return json(415, { error: "unsupported_media_type" });
  }
  const rawBody = await req.text();
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const eventType = String((payload as any)?.event ?? (payload as any)?.eventType ?? "").trim();
  if (!eventType) return json(400, { error: "invalid_event" });

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

  // 4) Persistir SEM signature (a autenticação já foi validada acima).
  const { error: insertErr } = await supabase
    .from("open_finance_webhook_events")
    .insert({
      event_id: eventId,
      event_type: eventType,
      pluggy_item_id: pluggyItemId,
      signature: null,
      payload,
      received_ip: receivedIp,
      status: "pending",
    });

  if (insertErr) {
    if ((insertErr as { code?: string }).code === "23505") {
      console.info("[pluggy-webhook] duplicate_event", eventId);
      return json(200, { received: true, duplicate: true });
    }
    console.error("[pluggy-webhook] persist_failed", (insertErr as { code?: string }).code);
    return json(500, { error: "persist_failed" });
  }

  console.info("[pluggy-webhook] event_persisted", eventType);

  const bg = triggerWorker();
  if (typeof EdgeRuntime !== "undefined" && typeof EdgeRuntime.waitUntil === "function") {
    EdgeRuntime.waitUntil(bg);
  }

  return json(200, { received: true, event_id: eventId });
});
