// pluggy-webhook
// Public endpoint receiving Pluggy webhook events.
//
// - verify_jwt = false (Pluggy is unauthenticated by JWT)
// - Signature: HMAC-SHA256(rawBody) with PLUGGY_WEBHOOK_SECRET,
//   compared against the `x-pluggy-signature` header in constant time.
// - Idempotent: upserts by (provider, event_id). Duplicate deliveries
//   return 200 without re-enqueuing.
// - Fast: only persists the event; the worker (pluggy-worker) is
//   responsible for calling Pluggy APIs and updating connections.
//
// Never logs the raw payload nor the signing secret.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-pluggy-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Constant-time comparison of two hex strings.
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  const bytes = new Uint8Array(sig);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return hex;
}

// Normalize an incoming signature header. Pluggy may send either the raw
// hex or a scheme-prefixed form like `sha256=...`.
function normalizeSignature(header: string | null): string | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (!trimmed) return null;
  const eq = trimmed.indexOf("=");
  const value = eq > -1 ? trimmed.slice(eq + 1) : trimmed;
  return value.toLowerCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const secret = Deno.env.get("PLUGGY_WEBHOOK_SECRET") ?? "";
    if (!secret) {
      console.error("[pluggy-webhook] missing_secret");
      return json({ error: "server_misconfigured" }, 500);
    }

    const rawBody = await req.text();
    if (!rawBody) return json({ error: "empty_body" }, 400);

    const providedSig = normalizeSignature(req.headers.get("x-pluggy-signature"));
    const expectedSig = await hmacSha256Hex(secret, rawBody);
    if (!providedSig || !timingSafeEqualHex(providedSig, expectedSig)) {
      console.warn("[pluggy-webhook] signature_mismatch");
      return json({ error: "invalid_signature" }, 401);
    }

    let event: Record<string, unknown>;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    // Pluggy events. Field names per docs: id, event, itemId, clientUserId,
    // triggeredBy, accountId?, error?, createdAt.
    const eventId =
      typeof event.id === "string" && event.id
        ? event.id
        // Fallback: synthesize a stable id when Pluggy doesn't send one.
        : `${(event.event as string) ?? "unknown"}:${(event.itemId as string) ?? "no-item"}:${
            (event.createdAt as string) ?? new Date().toISOString()
          }`;
    const eventType = (event.event as string) ?? "unknown";

    if (!eventType || eventType === "unknown") {
      return json({ error: "missing_event_type" }, 400);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Try to attach the local connection_id and company_id up front so the
    // worker can skip the lookup on the hot path.
    let connectionId: string | null = null;
    let companyId: string | null = null;
    const providerItemId = typeof event.itemId === "string" ? event.itemId : null;
    if (providerItemId) {
      const { data: conn } = await admin
        .from("open_finance_connections")
        .select("id, company_id")
        .eq("provider", "pluggy")
        .eq("provider_item_id", providerItemId)
        .maybeSingle();
      if (conn) {
        connectionId = conn.id;
        companyId = conn.company_id;
      }
    }

    const { error: upErr } = await admin
      .from("open_finance_webhook_events")
      .upsert(
        {
          provider: "pluggy",
          event_id: eventId,
          event_type: eventType,
          provider_item_id: providerItemId,
          provider_account_id: typeof event.accountId === "string" ? event.accountId : null,
          connection_id: connectionId,
          company_id: companyId,
          client_user_id: typeof event.clientUserId === "string" ? event.clientUserId : null,
          triggered_by: typeof event.triggeredBy === "string" ? event.triggeredBy : null,
          payload: event,
          status: "pending",
          next_attempt_at: new Date().toISOString(),
        },
        { onConflict: "provider,event_id", ignoreDuplicates: true },
      );

    if (upErr) {
      console.error("[pluggy-webhook] persist_failed", { code: upErr.code });
      return json({ error: "persist_failed" }, 500);
    }

    return json({ ok: true });
  } catch (e) {
    console.error("[pluggy-webhook] fatal", e);
    // Always return 200-family for unrecognized shapes so Pluggy doesn't
    // hammer retries, but keep 500 for real infra errors so we can see them.
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
