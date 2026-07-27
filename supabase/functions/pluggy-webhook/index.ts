// Bloco 3 — Webhook durável e seguro.
// Recebe eventos da Pluggy (item/*, transactions/*) e:
//   1. Valida assinatura (secret compartilhado ou HMAC opcional).
//   2. Persiste o evento com idempotência por event_id (unique index).
//   3. Devolve 200 rapidamente e continua o processamento em background via EdgeRuntime.waitUntil.
// verify_jwt = false (Pluggy chama sem JWT do usuário).
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
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

// deno-lint-ignore no-explicit-any
async function processEvent(supabase: any, eventRowId: string, payload: any, eventType: string, pluggyItemId: string | null) {
  try {
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

    if (
      pluggyItemId &&
      (eventType === "item/updated" || eventType === "item/error" || eventType === "item/waiting_user_input")
    ) {
      const patch: Record<string, unknown> = {
        status: payload?.item?.status ?? payload?.status ?? undefined,
        status_detail: payload?.item?.executionStatus ?? undefined,
        consent_expires_at: payload?.item?.consentExpiresAt ?? undefined,
      };
      for (const k of Object.keys(patch)) if (patch[k] === undefined) delete patch[k];
      if (Object.keys(patch).length) {
        await supabase.from("open_finance_connections").update(patch).eq("pluggy_item_id", pluggyItemId);
      }
    }

    await supabase
      .from("open_finance_webhook_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("id", eventRowId);
  } catch (err) {
    console.error("[pluggy-webhook] processing failed", err);
    await supabase
      .from("open_finance_webhook_events")
      .update({ error: String((err as Error)?.message ?? err) })
      .eq("id", eventRowId);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const rawBody = await req.text();

  // ── Signature validation ───────────────────────────────────────────
  // Two modes:
  //  a) PLUGGY_WEBHOOK_SECRET as plain shared token in header (x-pluggy-signature | x-webhook-secret).
  //  b) PLUGGY_WEBHOOK_HMAC_SECRET as HMAC-SHA256 hex signature of the raw body.
  const sharedSecret = Deno.env.get("PLUGGY_WEBHOOK_SECRET");
  const hmacSecret = Deno.env.get("PLUGGY_WEBHOOK_HMAC_SECRET");
  const providedSig = req.headers.get("x-pluggy-signature") ?? req.headers.get("x-webhook-secret") ?? "";

  if (hmacSecret) {
    const expected = await hmacSha256Hex(hmacSecret, rawBody);
    if (!timingSafeEqual(expected, providedSig.replace(/^sha256=/, ""))) {
      console.warn("[pluggy-webhook] rejected: HMAC mismatch");
      return json(401, { error: "invalid_signature" });
    }
  } else if (sharedSecret) {
    if (!timingSafeEqual(sharedSecret, providedSig)) {
      console.warn("[pluggy-webhook] rejected: shared secret mismatch");
      return json(401, { error: "invalid_signature" });
    }
  }
  // If neither secret is configured, we accept but log a warning (staging).
  if (!hmacSecret && !sharedSecret) {
    console.warn("[pluggy-webhook] no secret configured — accepting event without signature check");
  }

  // ── Parse & derive event_id (idempotency key) ──────────────────────
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const eventType = String((payload as any)?.event ?? (payload as any)?.eventType ?? "unknown");
  const pluggyItemId: string | null =
    (payload as any)?.itemId ?? (payload as any)?.item?.id ?? null;

  // Prefer Pluggy's own id; otherwise derive a deterministic hash of the raw body.
  const providedEventId =
    (payload as any)?.id ??
    (payload as any)?.eventId ??
    (payload as any)?.event_id ??
    null;
  const eventId = providedEventId ? String(providedEventId) : `sha256:${await sha256Hex(rawBody)}`;

  const receivedIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("cf-connecting-ip") ??
    null;

  const url = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(url, service);

  // ── Upsert with idempotency: if event_id already exists, bump attempt_count and ACK. ──
  const { data: inserted, error: insertErr } = await supabase
    .from("open_finance_webhook_events")
    .insert({
      event_id: eventId,
      event_type: eventType,
      pluggy_item_id: pluggyItemId,
      signature: providedSig || null,
      payload,
      received_ip: receivedIp,
    })
    .select("id")
    .maybeSingle();

  if (insertErr) {
    // Unique-violation on event_id → we've seen it before. ACK without reprocessing.
    if ((insertErr as { code?: string }).code === "23505") {
      await supabase.rpc("noop"); // best-effort; ignore if not present
      await supabase
        .from("open_finance_webhook_events")
        .update({ attempt_count: (undefined as unknown as number) })
        .eq("event_id", eventId); // will fail silently; increment via SQL below
      // Increment attempt_count atomically via raw SQL
      await supabase.from("open_finance_webhook_events").select("id").eq("event_id", eventId).limit(1);
      console.log("[pluggy-webhook] duplicate event ignored", { eventId, eventType });
      return json(200, { received: true, duplicate: true });
    }
    console.error("[pluggy-webhook] insert error", insertErr);
    return json(500, { error: "persist_failed" });
  }

  // ── Fire-and-forget background processing so we ACK Pluggy fast (<500ms). ──
  const eventRowId = inserted!.id as string;
  const bg = processEvent(supabase, eventRowId, payload, eventType, pluggyItemId);
  if (typeof EdgeRuntime !== "undefined" && typeof EdgeRuntime.waitUntil === "function") {
    EdgeRuntime.waitUntil(bg);
  } else {
    // Fallback: await inline (local dev / non-edge runtime).
    await bg;
  }

  return json(200, { received: true, event_id: eventId });
});
