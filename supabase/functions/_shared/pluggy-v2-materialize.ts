// V2 — Materialização isolada de item Pluggy em pluggy_v2_*
// Nenhuma leitura/escrita nas tabelas V1.
import { getItem, listAccounts, listTransactionsV2 } from "./pluggy-client.ts";

// Máscara simples para dados sensíveis
function maskAccountNumber(n?: string): string | null {
  if (!n) return null;
  const digits = n.replace(/\D/g, "");
  if (digits.length <= 4) return `***${digits}`;
  return `***${digits.slice(-4)}`;
}
function maskTaxNumber(n?: string): string | null {
  if (!n) return null;
  const d = n.replace(/\D/g, "");
  if (d.length === 11) return `***.***.***-${d.slice(-2)}`;
  if (d.length === 14) return `**.***.***/****-${d.slice(-2)}`;
  return `***${d.slice(-2)}`;
}
function maskOwner(n?: string): string | null {
  if (!n) return null;
  const parts = n.trim().split(/\s+/);
  if (parts.length === 1) return `${parts[0][0] ?? ""}***`;
  return `${parts[0][0]}*** ${parts[parts.length - 1][0]}***`;
}

export interface MaterializeV2Result {
  connectionId: string;
  accountsSynced: number;
  transactionsIngested: number;
  pagesProcessed: number;
  cursorAfter: string | null;
}

// deno-lint-ignore no-explicit-any
type Sb = any;

export async function materializePluggyItemV2(params: {
  supabase: Sb;
  pluggyItemId: string;
  companyId: string;
  createdBy?: string | null;
  triggerSource?: "webhook" | "manual" | "cron" | "initial" | "reconnect";
  sourceWebhookEventId?: string | null;
  fullSync?: boolean;
}): Promise<MaterializeV2Result> {
  const {
    supabase,
    pluggyItemId,
    companyId,
    createdBy = null,
    triggerSource = "webhook",
    sourceWebhookEventId = null,
    fullSync = false,
  } = params;

  // 1. Busca item na Pluggy
  const item = await getItem(pluggyItemId);
  if (!item) throw new Error(`pluggy_item_not_found:${pluggyItemId}`);

  // 2. Upsert conexão
  const { data: connRow, error: connErr } = await supabase
    .from("pluggy_v2_connections")
    .upsert(
      {
        company_id: companyId,
        created_by: createdBy,
        pluggy_item_id: item.id,
        connector_id: item.connector.id,
        connector_name: item.connector.name,
        status: item.status?.toLowerCase() ?? "created",
        execution_status: item.executionStatus ?? null,
        status_detail: item.error ? { error: item.error } : {},
        credentials_expires_at: item.consentExpiresAt ?? null,
        last_updated_at: item.lastUpdatedAt ?? null,
        last_sync_at: new Date().toISOString(),
        metadata: { last_item_snapshot_at: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "pluggy_item_id" },
    )
    .select("id, company_id")
    .single();
  if (connErr) throw new Error(`upsert_connection_failed:${connErr.message}`);
  const connectionId = connRow.id as string;

  // 3. Cria sync_run (idempotente por source_webhook_event_id)
  const { data: syncRow } = await supabase
    .from("pluggy_v2_sync_runs")
    .upsert(
      {
        connection_id: connectionId,
        company_id: companyId,
        triggered_by: triggerSource,
        source_webhook_event_id: sourceWebhookEventId,
        status: "running",
        started_at: new Date().toISOString(),
      },
      { onConflict: "source_webhook_event_id", ignoreDuplicates: false },
    )
    .select("id")
    .single();
  const syncRunId = syncRow?.id as string | undefined;

  // 4. Sincroniza contas
  const accountsResp = await listAccounts(item.id);
  const accounts = accountsResp?.results ?? [];
  let accountsSynced = 0;
  const accountIdMap = new Map<string, string>(); // pluggy_account_id -> internal id

  for (const acc of accounts) {
    const { data: accRow, error: accErr } = await supabase
      .from("pluggy_v2_accounts")
      .upsert(
        {
          connection_id: connectionId,
          company_id: companyId,
          pluggy_account_id: acc.id,
          pluggy_item_id: item.id,
          type: acc.type,
          subtype: acc.subtype ?? null,
          name: acc.name ?? null,
          marketing_name: acc.marketingName ?? null,
          number_masked: maskAccountNumber(acc.number),
          owner_masked: maskOwner(acc.owner),
          tax_number_masked: maskTaxNumber(acc.taxNumber),
          balance: acc.balance ?? null,
          currency_code: acc.currencyCode ?? "BRL",
          bank_data: acc.bankData ?? {},
          credit_data: acc.creditData ?? {},
          raw_snapshot: acc,
          last_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "pluggy_account_id" },
      )
      .select("id, pluggy_account_id")
      .single();
    if (accErr) {
      console.error("[pv2-materialize] account upsert error", accErr.message);
      continue;
    }
    accountIdMap.set(accRow.pluggy_account_id, accRow.id);
    accountsSynced++;
  }

  // 5. Sincroniza transações via /v2/transactions com cursor
  let pagesProcessed = 0;
  let transactionsIngested = 0;
  let cursorAfter: string | null = null;

  const from = fullSync
    ? new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString().slice(0, 10)
    : new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  for (const acc of accounts) {
    let cursor: string | undefined;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const page = await listTransactionsV2({
        accountId: acc.id,
        from,
        pageCursor: cursor,
        pageSize: 500,
      });
      pagesProcessed++;
      const txs = page.results ?? [];
      if (txs.length > 0) {
        const rows = txs.map((t) => ({
          account_id: accountIdMap.get(acc.id)!,
          connection_id: connectionId,
          company_id: companyId,
          pluggy_transaction_id: t.id,
          pluggy_account_id: acc.id,
          amount: t.amount,
          currency_code: t.currencyCode ?? "BRL",
          description: t.description ?? null,
          description_raw: t.descriptionRaw ?? null,
          category: t.category ?? null,
          category_id: t.categoryId ?? null,
          type: t.type,
          status: t.status ?? null,
          date: t.date.slice(0, 10),
          balance: t.balance ?? null,
          merchant: t.merchant ?? null,
          payment_data: t.paymentData ?? null,
          raw: t,
        }));
        const { error: txErr } = await supabase
          .from("pluggy_v2_transactions_raw")
          .upsert(rows, { onConflict: "pluggy_transaction_id", ignoreDuplicates: true });
        if (txErr) console.error("[pv2-materialize] tx upsert error", txErr.message);
        else transactionsIngested += rows.length;
      }
      cursor = page.nextCursor ?? undefined;
      cursorAfter = cursor ?? cursorAfter;
      if (!cursor) break;
      if (pagesProcessed > 200) {
        console.warn("[pv2-materialize] safety-cap 200 pages hit");
        break;
      }
    }
  }

  // 6. Finaliza sync_run
  if (syncRunId) {
    await supabase
      .from("pluggy_v2_sync_runs")
      .update({
        status: "success",
        finished_at: new Date().toISOString(),
        pages_processed: pagesProcessed,
        transactions_ingested: transactionsIngested,
        accounts_synced: accountsSynced,
        cursor_after: cursorAfter,
        from_date: from,
      })
      .eq("id", syncRunId);
  }

  return {
    connectionId,
    accountsSynced,
    transactionsIngested,
    pagesProcessed,
    cursorAfter,
  };
}
