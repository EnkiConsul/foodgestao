// V2 — Receiver fail-closed do webhook Pluggy
// Persistência mínima e retorno rápido; processamento é assíncrono via worker
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function timingSafeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

Deno.serve(async (req) => {
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Fail-closed: token obrigatório
  const expected = Deno.env.get("PLUGGY_V2_WEBHOOK_TOKEN");
  if (!expected) {
    console.error("[pv2-webhook] PLUGGY_V2_WEBHOOK_TOKEN not configured");
    return json({ error: "server_misconfigured" }, 500);
  }
  const provided =
    req.headers.get("x-360food-webhook-token") ??
    req.headers.get("x-webhook-token") ??
    "";
  if (!timingSafeEq(provided, expected)) {
    console.warn("[pv2-webhook] rejected: token mismatch");
    return json({ error: "unauthorized" }, 401);
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const eventId = (payload.id ?? payload.eventId ?? null) as string | null;
  const eventType = String(payload.event ?? payload.eventType ?? "unknown");
  const pluggyItemId = (payload.itemId ?? (payload as { item?: { id?: string } })?.item?.id ?? null) as
    | string
    | null;
  const triggeredBy = (payload.triggeredBy ?? null) as string | null;

  // Headers de auditoria (sem token)
  const headersEcho: Record<string, string> = {};
  for (const k of ["x-request-id", "user-agent", "content-type"]) {
    const v = req.headers.get(k);
    if (v) headersEcho[k] = v;
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { error } = await supabase.from("pluggy_v2_webhook_events").insert({
    event_id: eventId,
    event_type: eventType,
    pluggy_item_id: pluggyItemId,
    triggered_by: triggeredBy,
    payload,
    headers: headersEcho,
  });

  if (error) {
    // Duplicata via event_id: já enfileirado, aceita idempotência
    if (String(error.code) === "23505") return json({ ok: true, duplicate: true });
    console.error("[pv2-webhook] insert error", error.message);
    return json({ error: "persist_failed" }, 500);
  }

  // Dispara worker assíncrono (não bloqueia)
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/pluggy-v2-worker`;
  const cronSecret = Deno.env.get("PLUGGY_V2_CRON_TICK_SECRET") ?? "";
  fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-cron-secret": cronSecret },
    body: JSON.stringify({ trigger: "webhook" }),
  }).catch(() => {});

  return json({ ok: true });
});
