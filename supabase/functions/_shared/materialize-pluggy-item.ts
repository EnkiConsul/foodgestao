// P0 — Helper compartilhado: materializa um Item Pluggy em open_finance_connections
// + open_finance_accounts + open_finance_sync_runs, de forma idempotente e com
// resolução de tenant via clientUserId = "ofreq:<request_id>".
//
// Chamado por:
//   - pluggy-item-register (fast-path do onSuccess)
//   - pluggy-webhook (processamento server-side)
//   - pluggy-webhook-drain (retry)
//
// Nunca aceita company_id vindo diretamente de payload de webhook — a empresa é
// resolvida apenas pela open_finance_connection_requests correlacionada.

import { getItem, listAccounts, safePluggyError } from "./pluggy-client.ts";

const OFREQ_RE = /^ofreq:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export type MaterializeTrigger =
  | "item_register"
  | "webhook:item/created"
  | "webhook:item/updated"
  | "webhook-drain"
  | "materialize";

export interface MaterializeInput {
  supabase: any;
  itemId: string;
  requestId?: string | null;
  clientUserId?: string | null;
  connectedByUserId?: string | null;
  trigger: MaterializeTrigger;
  /** Se informado, força bind ao tenant (fast-path do onSuccess autenticado). */
  expectedCompanyId?: string | null;
}

export interface MaterializeResult {
  ok: true;
  connectionId: string;
  companyId: string;
  requestId: string | null;
  itemId: string;
  itemStatus: string | null;
  accountsFound: number;
  accountsUpserted: number;
  syncRunId: string | null;
  created: boolean;
  alreadyMaterialized: boolean;
}

export interface MaterializeError {
  ok: false;
  errorCode:
    | "missing_item_id"
    | "missing_client_user_id"
    | "invalid_client_user_id"
    | "request_not_found"
    | "correlation_expired"
    | "request_cancelled"
    | "request_item_mismatch"
    | "item_company_conflict"
    | "item_fetch_failed"
    | "accounts_fetch_failed"
    | "connection_upsert_failed"
    | "internal_error";
  detail?: string;
  transient?: boolean;
}

export type MaterializeOutput = MaterializeResult | MaterializeError;

function extractRequestIdFromClientUserId(v: string | null | undefined): string | null {
  if (!v) return null;
  const m = OFREQ_RE.exec(v);
  return m ? m[1].toLowerCase() : null;
}

export async function materializePluggyItem(input: MaterializeInput): Promise<MaterializeOutput> {
  const { supabase, itemId, trigger } = input;
  if (!itemId) return { ok: false, errorCode: "missing_item_id" };

  // 1. GET /items/{itemId} — fonte de verdade para clientUserId + connector + status.
  const itemResp = await getItem(itemId);
  if (!itemResp.ok) {
    return {
      ok: false,
      errorCode: "item_fetch_failed",
      detail: safePluggyError(itemResp.error, itemResp.httpStatus),
      transient: (itemResp.httpStatus ?? 0) >= 500 || itemResp.error === "network_error",
    };
  }
  const item = itemResp.data as any;

  // 2. Determina o clientUserId de forma segura (Item > payload > body).
  const clientUserId: string | null =
    (item.clientUserId as string | undefined) ??
    input.clientUserId ??
    (input.requestId ? `ofreq:${input.requestId}` : null);

  // 3. Verifica conexão pré-existente para este pluggy_item_id (idempotência global).
  const { data: existingConn } = await supabase
    .from("open_finance_connections")
    .select("id, company_id, connected_by_user_id")
    .eq("pluggy_item_id", itemId)
    .maybeSingle();

  // 4. Resolve a solicitação (obrigatória para new; opcional para reconnect com conexão existente).
  let requestId: string | null = input.requestId ?? null;
  let companyId: string | null = null;
  let requestedByUserId: string | null = null;

  if (!requestId) {
    const parsed = extractRequestIdFromClientUserId(clientUserId);
    if (parsed) requestId = parsed;
  } else if (!OFREQ_RE.test(`ofreq:${requestId}`)) {
    return { ok: false, errorCode: "invalid_client_user_id" };
  }

  if (!requestId && !existingConn) {
    // Sem request e sem conexão existente = não temos como amarrar tenant com segurança.
    if (!clientUserId) return { ok: false, errorCode: "missing_client_user_id" };
    return { ok: false, errorCode: "invalid_client_user_id" };
  }

  if (requestId) {
    const { data: reqRow } = await supabase
      .from("open_finance_connection_requests")
      .select(
        "id, company_id, requested_by_user_id, status, correlation_expires_at, cancelled_at, pluggy_item_id, mode",
      )
      .eq("id", requestId)
      .maybeSingle();
    if (!reqRow) {
      return { ok: false, errorCode: "request_not_found" };
    }
    if (reqRow.cancelled_at) {
      return { ok: false, errorCode: "request_cancelled" };
    }
    if (
      reqRow.correlation_expires_at &&
      new Date(reqRow.correlation_expires_at).getTime() < Date.now() &&
      reqRow.status !== "connected"
    ) {
      // Correlação expirada — mas se já tínhamos conexão local para este item, ainda é uma
      // atualização legítima (reconnect); só rejeitamos se ainda não existir a conexão.
      if (!existingConn) return { ok: false, errorCode: "correlation_expired" };
    }
    if (reqRow.pluggy_item_id && reqRow.pluggy_item_id !== itemId) {
      return { ok: false, errorCode: "request_item_mismatch" };
    }
    companyId = reqRow.company_id;
    requestedByUserId = reqRow.requested_by_user_id;
  } else if (existingConn) {
    // Reconnect sem request — reutiliza tenant da conexão existente (validado abaixo).
    companyId = existingConn.company_id;
    requestedByUserId = existingConn.connected_by_user_id;
  }

  // 5. Proteção cross-tenant: se já existe conexão para este item, tem que ser a mesma company.
  if (existingConn && companyId && existingConn.company_id !== companyId) {
    return { ok: false, errorCode: "item_company_conflict" };
  }
  if (input.expectedCompanyId && companyId && input.expectedCompanyId !== companyId) {
    return { ok: false, errorCode: "item_company_conflict" };
  }

  if (!companyId) {
    return { ok: false, errorCode: "request_not_found" };
  }

  // 6. Marca a solicitação como materializing (auditoria; não bloqueante).
  if (requestId) {
    await supabase
      .from("open_finance_connection_requests")
      .update({ status: "materializing" })
      .eq("id", requestId)
      .in("status", ["created", "token_created", "awaiting_authorization", "processing"]);
  }

  // 7. Upsert da conexão (idempotente por pluggy_item_id global).
  const connectedBy =
    requestedByUserId ??
    input.connectedByUserId ??
    existingConn?.connected_by_user_id ??
    null;

  if (!connectedBy) {
    return { ok: false, errorCode: "request_not_found", detail: "missing_connected_by_user_id" };
  }

  const connPayload = {
    company_id: companyId,
    connected_by_user_id: connectedBy,
    pluggy_item_id: itemId,
    connector_id: item.connector?.id ?? null,
    institution_name: item.connector?.name ?? null,
    institution_logo_url: item.connector?.imageUrl ?? null,
    status: item.status ?? "UPDATED",
    status_detail: item.executionStatus ?? null,
    consent_expires_at: item.consentExpiresAt ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data: conn, error: connErr } = await supabase
    .from("open_finance_connections")
    .upsert(connPayload, { onConflict: "pluggy_item_id" })
    .select("id, created_at, updated_at")
    .maybeSingle();

  if (connErr || !conn) {
    console.error("[materialize] connection upsert failed", connErr?.message);
    return {
      ok: false,
      errorCode: "connection_upsert_failed",
      transient: true,
    };
  }
  const alreadyMaterialized = Boolean(existingConn);
  const created = !alreadyMaterialized;

  // 8. Upsert das contas (idempotente por connection_id + pluggy_account_id).
  const accResp = await listAccounts(itemId);
  let accountsFound = 0;
  let accountsUpserted = 0;
  if (!accResp.ok) {
    // conexão criada com sucesso; contas ficam para retry.
    return {
      ok: false,
      errorCode: "accounts_fetch_failed",
      detail: safePluggyError(accResp.error, accResp.httpStatus),
      transient: true,
    };
  }
  const results = (accResp.data.results ?? []) as any[];
  accountsFound = results.length;
  if (results.length) {
    const rows = results.map((a) => ({
      connection_id: conn.id,
      company_id: companyId!,
      pluggy_account_id: a.id,
      type: a.type ?? null,
      subtype: a.subtype ?? null,
      name: a.name ?? a.marketingName ?? null,
      number: a.number ?? null,
      balance: a.balance ?? null,
      currency: a.currencyCode ?? "BRL",
      owner_name: a.owner ?? null,
      tax_number: a.taxNumber ?? null,
      transfer_number: a.bankData?.transferNumber ?? null,
      credit_brand: a.creditData?.brand ?? null,
      credit_level: a.creditData?.level ?? null,
      credit_limit: a.creditData?.creditLimit ?? null,
      available_credit_limit: a.creditData?.availableCreditLimit ?? null,
      balance_close_date: a.creditData?.balanceCloseDate ?? null,
      balance_due_date: a.creditData?.balanceDueDate ?? null,
      raw: a,
      removed_at: null,
    }));
    const { error: accErr } = await supabase
      .from("open_finance_accounts")
      .upsert(rows, { onConflict: "connection_id,pluggy_account_id" });
    if (accErr) {
      console.error("[materialize] accounts upsert failed", accErr.message);
      return { ok: false, errorCode: "accounts_fetch_failed", transient: true };
    }
    accountsUpserted = rows.length;
  }

  // 9. Conclui a solicitação.
  if (requestId) {
    await supabase
      .from("open_finance_connection_requests")
      .update({
        status: "connected",
        pluggy_item_id: itemId,
        completed_at: new Date().toISOString(),
        error: null,
        error_code: null,
      })
      .eq("id", requestId);
  }

  // 10. Enfileira sync inicial se não houver já queued/running.
  let syncRunId: string | null = null;
  const { data: existingRun } = await supabase
    .from("open_finance_sync_runs")
    .select("id")
    .eq("connection_id", conn.id)
    .in("status", ["queued", "running"])
    .in("triggered_by", ["webhook:item/created", "item_register", "materialize"])
    .limit(1)
    .maybeSingle();

  if (!existingRun) {
    const { data: run, error: runErr } = await supabase
      .from("open_finance_sync_runs")
      .insert({
        connection_id: conn.id,
        company_id: companyId,
        status: "queued",
        triggered_by:
          trigger === "webhook:item/created" || trigger === "webhook:item/updated"
            ? "webhook:item/created"
            : trigger === "item_register"
            ? "item_register"
            : "materialize",
      })
      .select("id")
      .maybeSingle();
    if (!runErr && run) syncRunId = run.id;
    else if (runErr && (runErr as any).code !== "23505") {
      console.warn("[materialize] sync run enqueue failed", runErr.message);
    }
  } else {
    syncRunId = existingRun.id;
  }

  return {
    ok: true,
    connectionId: conn.id,
    companyId,
    requestId,
    itemId,
    itemStatus: item.status ?? null,
    accountsFound,
    accountsUpserted,
    syncRunId,
    created,
    alreadyMaterialized,
  };
}
