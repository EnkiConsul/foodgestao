// P0 — Webhook durável e recuperável.
//
// Contrato:
//   1. Valida assinatura configurada (shared secret ou HMAC).
//   2. Insere o evento em open_finance_webhook_events com status='pending'
//      (idempotente por event_id).
//   3. Responde 2XX rapidamente.
//   4. Em background: chama processEvent(). Falhas transitórias marcam
//      status='retry' com next_attempt_at + backoff; sucesso marca
//      status='processed' e preenche connection_id/company_id.
//   5. pluggy-webhook-drain reexecuta processEvent para eventos pending/retry.
//
// Não confia em company_id do payload. A empresa é resolvida via helper
// compartilhado a partir do clientUserId (ofreq:<request_id>).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { materializePluggyItem } from "../_shared/materialize-pluggy-item.ts";

// deno-lint-ignore no-explicit-any
declare const EdgeRuntime: any;

const MATERIALIZE_EVENTS = new Set(["item/created", "item/updated"]);
const SYNC_EVENTS = new Set([
  "transactions/created",
  "transactions/updated",
  "transactions/deleted",
]);
const USER_ACTION_ERRORS = new Set([
  "USER_AUTHORIZATION_PENDING",
  "USER_AUTHORIZATION_NOT_GRANTED",
  "USER_INPUT_TIMEOUT",
  "USER_NOT_SUPPORTED",
]);

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

function backoffFor(attempt: number): Date {
  const seconds = Math.min(60 * 30, Math.pow(2, attempt) * 30); // 30s, 60s, 120s, ..., cap 30min
  return new Date(Date.now() + seconds * 1000);
}

interface WebhookRow {
  id: string;
  attempt_count: number;
  status: string;
}

// deno-lint-ignore no-explicit-any
export async function processEvent(supabase: any, row: WebhookRow, payload: any, eventType: string, pluggyItemId: string | null) {
  // Marca processing
  await supabase
    .from("open_finance_webhook_events")
    .update({ status: "processing", attempt_count: (row.attempt_count ?? 0) + 1 })
    .eq("id", row.id);

  try {
    const rawItem = (payload as any)?.item ?? {};
    const clientUserId: string | null =
      (rawItem.clientUserId as string | undefined) ??
      (payload as any)?.clientUserId ??
      null;

    // USER_AUTHORIZATION_PENDING => marca request como awaiting_authorization
    // sem falhar definitivamente e sem criar conexão.
    const errCode: string | null =
      rawItem?.error?.code ?? (payload as any)?.error?.code ?? null;

    if (eventType === "item/error" && errCode && USER_ACTION_ERRORS.has(errCode)) {
      if (clientUserId && clientUserId.startsWith("ofreq:")) {
        const requestId = clientUserId.substring("ofreq:".length);
        await supabase
          .from("open_finance_connection_requests")
          .update({ status: "awaiting_authorization", error_code: errCode })
          .eq("id", requestId)
          .in("status", ["created", "token_created", "processing", "materializing"]);
      }
      await supabase
        .from("open_finance_webhook_events")
        .update({
          status: "processed",
          processed_at: new Date().toISOString(),
          client_user_id: clientUserId,
          last_error_code: errCode,
        })
        .eq("id", row.id);
      return;
    }

    // Localiza conexão existente
    let conn: { id: string; company_id: string; requires_user_action?: boolean } | null = null;
    if (pluggyItemId) {
      const { data } = await supabase
        .from("open_finance_connections")
        .select("id, company_id, requires_user_action")
        .eq("pluggy_item_id", pluggyItemId)
        .maybeSingle();
      conn = data ?? null;
    }

    // Materialização quando aplicável
    if (pluggyItemId && MATERIALIZE_EVENTS.has(eventType)) {
      // Sempre roda o helper (idempotente); ele cuida do already_materialized.
      const requestId = clientUserId?.startsWith("ofreq:")
        ? clientUserId.substring("ofreq:".length)
        : null;
      const result = await materializePluggyItem({
        supabase,
        itemId: pluggyItemId,
        requestId,
        clientUserId,
        trigger: eventType === "item/created" ? "webhook:item/created" : "webhook:item/updated",
      });
      if (!result.ok) {
        // Erro estrutural => marca retry se transitório, senão falha permanente.
        if (result.transient) {
          const nextAttempt = backoffFor(row.attempt_count ?? 0);
          await supabase
            .from("open_finance_webhook_events")
            .update({
              status: "retry",
              next_attempt_at: nextAttempt.toISOString(),
              last_error_code: result.errorCode,
              client_user_id: clientUserId,
            })
            .eq("id", row.id);
          return;
        }
        // Falha permanente (ex.: request_not_found, correlation_expired, item_company_conflict).
        await supabase
          .from("open_finance_webhook_events")
          .update({
            status: "failed",
            processed_at: new Date().toISOString(),
            last_error_code: result.errorCode,
            client_user_id: clientUserId,
          })
          .eq("id", row.id);
        return;
      }
      conn = { id: result.connectionId, company_id: result.companyId };
    }

    // Item deleted => marca desconectada.
    if (conn && eventType === "item/deleted") {
      await supabase
        .from("open_finance_connections")
        .update({
          status: "disconnected",
          needs_remote_delete: false,
          remote_deleted_at: new Date().toISOString(),
          disconnected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", conn.id);
    }

    // Classificação estado
    let requiresUserAction = false;
    if (conn && (eventType.startsWith("item/") || eventType === "connector/status_updated")) {
      const item = rawItem;
      const { data: state } = await supabase.rpc("classify_open_finance_item_state", {
        _connection_id: conn.id,
        _status: item.status ?? (payload as any)?.status ?? null,
        _execution_status: item.executionStatus ?? (payload as any)?.executionStatus ?? null,
        _error_code: item.error?.code ?? (payload as any)?.error?.code ?? null,
        _error_message: item.error?.message ?? (payload as any)?.error?.message ?? null,
        _consent_expires_at: item.consentExpiresAt ?? null,
        _parameter: item.parameter ?? null,
      });
      requiresUserAction = Boolean((state as any)?.requires_user_action);
    }

    if (conn && !requiresUserAction && SYNC_EVENTS.has(eventType)) {
      await supabase.from("open_finance_sync_runs").insert({
        connection_id: conn.id,
        company_id: conn.company_id,
        status: "queued",
        triggered_by: `webhook:${eventType}`,
      });
    }

    await supabase
      .from("open_finance_webhook_events")
      .update({
        status: "processed",
        processed_at: new Date().toISOString(),
        connection_id: conn?.id ?? null,
        company_id: conn?.company_id ?? null,
        client_user_id: clientUserId,
      })
      .eq("id", row.id);
  } catch (err) {
    console.error("[pluggy-webhook] processing failed", err);
    const nextAttempt = backoffFor(row.attempt_count ?? 0);
    await supabase
      .from("open_finance_webhook_events")
      .update({
        status: "retry",
        next_attempt_at: nextAttempt.toISOString(),
        error: String((err as Error)?.message ?? err).slice(0, 500),
        last_error_code: "internal_error",
      })
      .eq("id", row.id);
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

  const { data: inserted, error: insertErr } = await supabase
    .from("open_finance_webhook_events")
    .insert({
      event_id: eventId,
      event_type: eventType,
      pluggy_item_id: pluggyItemId,
      signature: providedSig || null,
      payload,
      received_ip: receivedIp,
      status: "pending",
    })
    .select("id, attempt_count, status")
    .maybeSingle();

  if (insertErr) {
    if ((insertErr as { code?: string }).code === "23505") {
      return json(200, { received: true, duplicate: true });
    }
    console.error("[pluggy-webhook] insert error", insertErr);
    return json(500, { error: "persist_failed" });
  }

  const bg = processEvent(supabase, inserted as WebhookRow, payload, eventType, pluggyItemId);
  if (typeof EdgeRuntime !== "undefined" && typeof EdgeRuntime.waitUntil === "function") {
    EdgeRuntime.waitUntil(bg);
  } else {
    await bg;
  }

  return json(200, { received: true, event_id: eventId });
});
