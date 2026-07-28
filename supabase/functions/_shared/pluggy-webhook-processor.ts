// Shared logic to process an open_finance_webhook_events row.
// Used by pluggy-webhook (background after ACK) and pluggy-webhook-drain (retry).

import { materializePluggyItem } from "./materialize-pluggy-item.ts";

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

export function backoffFor(attempt: number): Date {
  const seconds = Math.min(60 * 30, Math.pow(2, attempt) * 30);
  return new Date(Date.now() + seconds * 1000);
}

export interface WebhookRow {
  id: string;
  attempt_count: number;
  status: string;
}

// deno-lint-ignore no-explicit-any
export async function processWebhookEvent(supabase: any, row: WebhookRow, payload: any, eventType: string, pluggyItemId: string | null) {
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

    let conn: { id: string; company_id: string } | null = null;
    if (pluggyItemId) {
      const { data } = await supabase
        .from("open_finance_connections")
        .select("id, company_id")
        .eq("pluggy_item_id", pluggyItemId)
        .maybeSingle();
      conn = data ?? null;
    }

    if (pluggyItemId && MATERIALIZE_EVENTS.has(eventType)) {
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
