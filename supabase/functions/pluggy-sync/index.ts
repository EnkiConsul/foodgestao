// Worker: claims a queued sync run, fetches accounts + transactions from Pluggy,
// upserts open_finance_accounts, and stages transactions into open_finance_transactions_raw.
// Actual promotion into `transactions` happens in the reconciliation block.
//
// Two invocation modes:
//   - Manual per-connection: POST { connection_id, from?, to? } as authenticated user (admin/owner of company)
//   - Cron drain: POST { drain: true, secret: PLUGGY_SYNC_ALL_SECRET } — pulls next queued run(s)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "https://esm.sh/zod@3.23.8";
import {
  listAccounts,
  listTransactions,
  safePluggyError,
  getItem,
  type PluggyTransaction,
} from "../_shared/pluggy-client.ts";

const WORKER_ID = `pluggy-sync-${crypto.randomUUID()}`;

const BodySchema = z.union([
  z.object({
    connection_id: z.string().uuid(),
    from: z.string().optional(),
    to: z.string().optional(),
  }),
  z.object({
    drain: z.literal(true),
    secret: z.string().min(8),
    max_runs: z.number().int().min(1).max(20).optional(),
  }),
]);

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function importHash(companyId: string, pluggyTxId: string): Promise<string> {
  const buf = new TextEncoder().encode(`${companyId}:${pluggyTxId}`);
  const d = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function runSync(
  supabase: ReturnType<typeof createClient>,
  runId: string,
  connectionId: string,
  companyId: string,
  itemId: string,
  from?: string,
  to?: string,
): Promise<{ ok: boolean; stats: Record<string, number>; error?: string }> {
  const stats = {
    accounts: 0,
    transactions_raw: 0,
    pages: 0,
    incremental_accounts: 0,
    full_backfill_accounts: 0,
  };
  const OVERLAP_DAYS = 3; // safety window for late-posted / edited transactions
  const BACKFILL_DAYS = 90;
  const isoDate = (d: Date) => d.toISOString().slice(0, 10);

  // refresh item (status + consent) e classifica erros que exigem ação do usuário (Bloco 8)
  const itemResp = await getItem(itemId);
  if (itemResp.ok) {
    const item = itemResp.data as any;
    const { data: state } = await supabase.rpc("classify_open_finance_item_state", {
      _connection_id: connectionId,
      _status: item.status ?? null,
      _execution_status: item.executionStatus ?? null,
      _error_code: item.error?.code ?? null,
      _error_message: item.error?.message ?? null,
      _consent_expires_at: item.consentExpiresAt ?? null,
      _parameter: item.parameter ?? null,
    });
    if ((state as any)?.requires_user_action) {
      const action = (state as any).user_action_type as string;
      return {
        ok: false,
        stats,
        error: `user_action_required:${action}`,
      };
    }
  }


  const accResp = await listAccounts(itemId);
  if (!accResp.ok) {
    return { ok: false, stats, error: safePluggyError(accResp.error, accResp.httpStatus) };
  }

  const accounts = accResp.data.results ?? [];
  stats.accounts = accounts.length;

  if (accounts.length) {
    await supabase
      .from("open_finance_accounts")
      .upsert(
        accounts.map((a) => ({
          connection_id: connectionId,
          company_id: companyId,
          pluggy_account_id: a.id,
          type: a.type,
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
          removed_at: null, // reappearing account clears soft-remove
          raw: a as any,
        })),
        { onConflict: "connection_id,pluggy_account_id" },
      );
  }

  // Soft-remove accounts that disappeared from Pluggy since the last sync.
  const activePluggyIds = accounts.map((a) => a.id);
  if (activePluggyIds.length > 0) {
    await supabase
      .from("open_finance_accounts")
      .update({ removed_at: new Date().toISOString() })
      .eq("connection_id", connectionId)
      .is("removed_at", null)
      .not("pluggy_account_id", "in", `(${activePluggyIds.map((id) => `"${id}"`).join(",")})`);
  }


  // Resolve internal OF account ids (only active ones) with their cursors
  const { data: ofAccts } = await supabase
    .from("open_finance_accounts")
    .select("id, pluggy_account_id, sync_cursor_date, sync_cursor_updated_at, first_sync_completed_at")
    .eq("connection_id", connectionId)
    .is("removed_at", null);
  const acctMeta = new Map<string, {
    id: string;
    cursorDate: string | null;
    cursorUpdatedAt: string | null;
    firstSync: string | null;
  }>((ofAccts ?? []).map((r: any) => [
    r.pluggy_account_id,
    {
      id: r.id,
      cursorDate: r.sync_cursor_date,
      cursorUpdatedAt: r.sync_cursor_updated_at,
      firstSync: r.first_sync_completed_at,
    },
  ]));

  const today = new Date();
  const globalTo = to ?? isoDate(today);

  for (const acc of accounts) {
    const meta = acctMeta.get(acc.id);
    if (!meta) continue;

    // Incremental window: from = cursor - overlap; if never synced, backfill 90 days.
    let fromDate: string;
    let isIncremental: boolean;
    if (from) {
      fromDate = from;
      isIncremental = false;
    } else if (meta.cursorDate) {
      const c = new Date(meta.cursorDate + "T00:00:00Z");
      c.setUTCDate(c.getUTCDate() - OVERLAP_DAYS);
      fromDate = isoDate(c);
      isIncremental = true;
    } else {
      const c = new Date(today);
      c.setUTCDate(c.getUTCDate() - BACKFILL_DAYS);
      fromDate = isoDate(c);
      isIncremental = false;
    }
    if (isIncremental) stats.incremental_accounts += 1;
    else stats.full_backfill_accounts += 1;

    let maxTxDate: string | null = meta.cursorDate;
    let maxUpdatedAt: string | null = meta.cursorUpdatedAt;

    let page = 1;
    while (true) {
      const txResp = await listTransactions({
        accountId: acc.id,
        from: fromDate,
        to: globalTo,
        pageSize: 500,
        page,
      });
      if (!txResp.ok) {
        return { ok: false, stats, error: safePluggyError(txResp.error, txResp.httpStatus) };
      }
      stats.pages += 1;
      const results = txResp.data.results ?? [];
      if (!results.length) break;

      const rows = await Promise.all(
        results.map(async (t: PluggyTransaction & { deletedAt?: string; isDeleted?: boolean; updatedAt?: string }) => {
          if (t.date && (!maxTxDate || t.date > maxTxDate)) maxTxDate = t.date.slice(0, 10);
          if (t.updatedAt && (!maxUpdatedAt || t.updatedAt > maxUpdatedAt)) maxUpdatedAt = t.updatedAt;
          // Bloco 3 (P0-3): captura deleções vindas da Pluggy.
          const deletedAt = t.deletedAt
            ? new Date(t.deletedAt).toISOString()
            : (t.isDeleted ? new Date().toISOString() : null);
          return {
            connection_id: connectionId,
            of_account_id: meta.id,
            company_id: companyId,
            pluggy_transaction_id: t.id,
            import_hash: await importHash(companyId, t.id),
            raw: t as any,
            deleted_at: deletedAt,
          };
        }),
      );

      // Upsert dedup by (of_account_id, pluggy_transaction_id) — updates raw payload
      // so edits/enrichments and soft-deletes from Pluggy são capturados nas próximas rodadas.
      const { error } = await supabase
        .from("open_finance_transactions_raw")
        .upsert(rows, { onConflict: "of_account_id,pluggy_transaction_id", ignoreDuplicates: false });
      if (error) console.error("[pluggy-sync] upsert raw error:", error.message);
      stats.transactions_raw += rows.length;
      const deletedCount = rows.filter((r) => r.deleted_at).length;
      if (deletedCount > 0) (stats as any).deleted_flagged = ((stats as any).deleted_flagged ?? 0) + deletedCount;

      if (page >= (txResp.data.totalPages ?? page)) break;
      page += 1;
    }

    // Persist per-account cursor after successful account traversal
    const patch: Record<string, unknown> = {};
    if (maxTxDate && maxTxDate !== meta.cursorDate) patch.sync_cursor_date = maxTxDate;
    if (maxUpdatedAt && maxUpdatedAt !== meta.cursorUpdatedAt) patch.sync_cursor_updated_at = maxUpdatedAt;
    if (maxTxDate) patch.last_transaction_at = new Date(maxTxDate + "T00:00:00Z").toISOString();
    if (!meta.firstSync) patch.first_sync_completed_at = new Date().toISOString();
    if (Object.keys(patch).length) {
      await supabase.from("open_finance_accounts").update(patch).eq("id", meta.id);
    }
  }

  // Auto-reconcile: materialize raw rows for accounts with auto_import=true & mapped local account.
  // Rows without a mapping remain pending in the reconciliation center for manual review.
  try {
    const { data: recon } = await supabase.rpc("auto_promote_open_finance_raw", {
      _connection_id: connectionId,
    });
    if (recon && typeof recon === "object") {
      const r = recon as Record<string, number>;
      (stats as any).promoted = r.inserted ?? 0;
      (stats as any).duplicates = r.duplicates ?? 0;
      (stats as any).pending_manual = r.skipped ?? 0;
      (stats as any).promote_errors = r.errors ?? 0;
    }
  } catch (e) {
    console.error("[pluggy-sync] auto_promote error:", (e as Error).message);
  }

  await supabase
    .from("open_finance_connections")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("id", connectionId);

  return { ok: true, stats };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  const { isPluggyV1Frozen, pluggyV1FrozenResponse } = await import("../_shared/pluggy-v1-freeze.ts");
  if (isPluggyV1Frozen()) return pluggyV1FrozenResponse(corsHeaders);

  const url = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(url, service);

  let body;
  try { body = BodySchema.parse(await req.json()); }
  catch { return json(400, { error: "invalid_body" }); }

  // Drain mode (cron / internal)
  if ("drain" in body) {
    const expected = Deno.env.get("PLUGGY_SYNC_ALL_SECRET");
    const cronSecret = Deno.env.get("PLUGGY_CRON_SECRET");
    const cronTick = Deno.env.get("PLUGGY_CRON_TICK_SECRET");
    const ok = (expected && body.secret === expected)
      || (cronSecret && body.secret === cronSecret)
      || (cronTick && body.secret === cronTick);
    if (!ok) return json(401, { error: "forbidden" });

    const max = body.max_runs ?? 5;
    const processed: any[] = [];
    for (let i = 0; i < max; i++) {
      const { data: runId } = await supabase.rpc("claim_open_finance_sync", {
        _worker_id: WORKER_ID,
        _lock_seconds: 300,
      });
      if (!runId) break;

      const { data: run } = await supabase
        .from("open_finance_sync_runs")
        .select("id, connection_id, company_id, open_finance_connections!inner(pluggy_item_id)")
        .eq("id", runId as string)
        .maybeSingle();

      if (!run) {
        await supabase.rpc("release_open_finance_sync", {
          _run_id: runId, _status: "error", _stats: {}, _error: "run_not_found",
        });
        continue;
      }

      const pluggyItemId = (run as any).open_finance_connections?.pluggy_item_id as string;
      const result = await runSync(supabase, run.id, run.connection_id, run.company_id, pluggyItemId);
      await supabase.rpc("release_open_finance_sync", {
        _run_id: run.id,
        _status: result.ok ? "success" : "error",
        _stats: result.stats,
        _error: result.error ?? null,
      });
      processed.push({ run_id: run.id, ok: result.ok, stats: result.stats });
    }
    return json(200, { processed });
  }

  // User-triggered sync
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json(401, { error: "unauthenticated" });
  const supabaseUser = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await supabaseUser.auth.getUser();
  if (!userData?.user) return json(401, { error: "unauthenticated" });

  const { data: conn } = await supabase
    .from("open_finance_connections")
    .select("id, company_id, pluggy_item_id")
    .eq("id", body.connection_id)
    .maybeSingle();
  if (!conn) return json(404, { error: "connection_not_found" });

  const { data: allowed } = await supabase.rpc("is_company_admin_or_owner", {
    _user_id: userData.user.id,
    _company_id: conn.company_id,
  });
  if (!allowed) return json(403, { error: "forbidden" });

  const { data: runRow } = await supabase
    .from("open_finance_sync_runs")
    .insert({
      connection_id: conn.id,
      company_id: conn.company_id,
      status: "running",
      triggered_by: "manual",
      claimed_by: WORKER_ID,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();

  const result = await runSync(
    supabase,
    runRow?.id ?? "",
    conn.id,
    conn.company_id,
    conn.pluggy_item_id,
    body.from,
    body.to,
  );

  if (runRow?.id) {
    await supabase.rpc("release_open_finance_sync", {
      _run_id: runRow.id,
      _status: result.ok ? "success" : "error",
      _stats: result.stats,
      _error: result.error ?? null,
    });
  }

  if (!result.ok) return json(502, { error: result.error, stats: result.stats });
  return json(200, { ok: true, stats: result.stats });
});
