// Pure processor: given a webhook event row + payload, executa a lógica de
// materialização/sync e retorna um resultado. NÃO altera o status do evento —
// isso é feito pelo worker via RPCs atômicas (pluggy_webhook_finalize_*).

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

export interface WebhookRow {
  id: string;
  attempt_count: number;
  status: string;
  event_type: string;
  pluggy_item_id: string | null;
  payload: Record<string, unknown> | null;
}

export interface ProcessResult {
  ok: boolean;
  transient?: boolean;
  errorCode?: string | null;
  errorMessage?: string | null;
  connectionId?: string | null;
  companyId?: string | null;
  clientUserId?: string | null;
}

// deno-lint-ignore no-explicit-any
export async function processWebhookEvent(supabase: any, row: WebhookRow): Promise<ProcessResult> {
  const eventType = row.event_type;
  const pluggyItemId = row.pluggy_item_id;
  const payload = (row.payload ?? {}) as Record<string, unknown>;

  try {
    const rawItem = (payload as any)?.item ?? {};
    const clientUserId: string | null =
      (rawItem.clientUserId as string | undefined) ??
      (payload as any)?.clientUserId ??
      null;

    const errCode: string | null =
      rawItem?.error?.code ?? (payload as any)?.error?.code ?? null;

    // Erros de ação do usuário: marca a request e finaliza como processado.
    if (eventType === "item/error" && errCode && USER_ACTION_ERRORS.has(errCode)) {
      if (clientUserId && clientUserId.startsWith("ofreq:")) {
        const requestId = clientUserId.substring("ofreq:".length);
        await supabase
          .from("open_finance_connection_requests")
          .update({ status: "awaiting_authorization", error_code: errCode })
          .eq("id", requestId)
          .in("status", ["created", "token_created", "processing", "materializing"]);
      }
      return { ok: true, clientUserId, errorCode: errCode };
    }

    // Localiza conexão existente (para casos que não passam por materialize).
    let conn: { id: string; company_id: string } | null = null;
    if (pluggyItemId) {
      const { data } = await supabase
        .from("open_finance_connections")
        .select("id, company_id")
        .eq("pluggy_item_id", pluggyItemId)
        .maybeSingle();
      conn = data ?? null;
    }

    // Materialização (item/created + item/updated).
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
        return {
          ok: false,
          transient: Boolean(result.transient),
          errorCode: result.errorCode,
          errorMessage: (result as any).detail ?? result.errorCode,
          clientUserId,
        };
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

    // Verifica se o item exige ação do usuário antes de agendar sync.
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
      // Idempotência: só enfileira 1 sync por evento de webhook.
      const { data: existing } = await supabase
        .from("open_finance_sync_runs")
        .select("id")
        .eq("source_webhook_event_id", row.id)
        .maybeSingle();
      if (!existing) {
        await supabase.from("open_finance_sync_runs").insert({
          connection_id: conn.id,
          company_id: conn.company_id,
          status: "queued",
          triggered_by: `webhook:${eventType}`,
          source_webhook_event_id: row.id,
        });
      }
    }

    return {
      ok: true,
      connectionId: conn?.id ?? null,
      companyId: conn?.company_id ?? null,
      clientUserId,
    };
  } catch (err) {
    console.error("[pluggy-webhook-processor] failure", err);
    return {
      ok: false,
      transient: true,
      errorCode: "internal_error",
      errorMessage: String((err as Error)?.message ?? err).slice(0, 500),
    };
  }
}
