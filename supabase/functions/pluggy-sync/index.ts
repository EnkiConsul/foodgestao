// pluggy-sync
// Motor de ingestão de transações Open Finance (Pluggy).
//
// Responsabilidades:
//   - Reivindica lock por conexão via claim_open_finance_sync (TTL 5 min).
//   - Cria ou consome um `open_finance_sync_run` (status running).
//   - Para cada open_finance_account ativa + vinculada + auto_import,
//     pagina /transactions da Pluggy a partir de sync_cursor_created_at
//     (fallback: últimos 90 dias) e ingere em lotes de 500 via
//     ingest_of_transaction (SECURITY DEFINER, idempotente + anti-ressurreição).
//   - Atualiza sync_cursor_created_at por conta.
//   - Persiste contadores no sync_run e libera o lock.
//
// Autenticação: JWT super_admin OU header x-internal-token = service role
// (uso via cron/worker). Sem logs de payload cru, IDs externos ou secrets.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  listTransactions,
  PluggyError,
  type PluggyTransaction,
} from "../_shared/pluggy.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const BATCH_SIZE = 500;
const DEFAULT_LOOKBACK_DAYS = 90;
const INITIAL_BACKFILL_DAYS = 365; // usado quando a conta nunca sincronizou
const LOCK_TTL_SECONDS = 300;
const MAX_CONCURRENCY = 8; // ingest_of_transaction chamadas paralelas por lote

type OfAccountRow = {
  id: string;
  company_id: string;
  provider_account_id: string;
  provider_type: string;
  local_account_id: string | null;
  local_credit_card_id: string | null;
  sync_cursor_created_at: string | null;
  auto_import: boolean;
  is_active: boolean;
};

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

// Map tipo Pluggy -> transaction_type interno. CREDIT (entrada) / DEBIT (saída).
function mapTransactionType(t: PluggyTransaction): "entrada" | "saida" {
  // Amount signal: Pluggy costuma enviar amount positivo em CREDIT e negativo em DEBIT,
  // mas há bancos onde vem invertido. Usamos `type` como fonte de verdade.
  if (t.type === "CREDIT") return "entrada";
  return "saida";
}

// Constrói o payload que ingest_of_transaction espera.
function buildIngestPayload(
  acc: OfAccountRow,
  tx: PluggyTransaction,
): Record<string, unknown> {
  const merchant = (tx.merchant ?? null) as Record<string, unknown> | null;
  const counterpartyName =
    (merchant?.name as string | undefined) ??
    (merchant?.businessName as string | undefined) ??
    null;
  const counterpartyCnpj = (merchant?.cnpj as string | undefined) ?? null;
  const paymentData = (tx.paymentData ?? null) as Record<string, unknown> | null;
  const paymentMethod =
    (paymentData?.paymentMethod as string | undefined) ??
    (paymentData?.method as string | undefined) ??
    null;

  return {
    company_id: acc.company_id,
    connection_account_id: acc.id,
    external_id: tx.id,
    account_id: acc.provider_type === "BANK" ? acc.local_account_id : null,
    credit_card_id: acc.provider_type === "CREDIT" ? acc.local_credit_card_id : null,
    description: tx.description?.slice(0, 500) ?? "",
    amount: Math.abs(Number(tx.amount)),
    transaction_type: mapTransactionType(tx),
    transaction_date: tx.date?.slice(0, 10) ?? ymd(new Date()),
    status: "confirmado",
    provider_status: tx.status ?? null,
    provider_category: tx.category ?? null,
    provider_last_updated_at: tx.date ?? null,
    counterparty_name: counterpartyName,
    counterparty_cnpj: counterpartyCnpj,
    payment_method_provider: paymentMethod,
    // Pareamento e is_invoice_payment ficam pro Bloco 8.
    pairing_status: null,
    exclude_from_results: false,
    needs_review: false,
  };
}

// Runs `worker` em `items` com concorrência controlada.
async function pool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = index++;
      if (i >= items.length) return;
      results[i] = await worker(items[i]);
    }
  });
  await Promise.all(runners);
  return results;
}

type PerAccountStats = {
  of_account_id: string;
  fetched: number;
  ingested: number;
  errors: number;
  new_cursor: string | null;
};

async function syncAccount(
  admin: SupabaseClient,
  acc: OfAccountRow,
): Promise<PerAccountStats> {
  const stats: PerAccountStats = {
    of_account_id: acc.id,
    fetched: 0,
    ingested: 0,
    errors: 0,
    new_cursor: acc.sync_cursor_created_at,
  };

  const fromDate = acc.sync_cursor_created_at
    ? new Date(acc.sync_cursor_created_at)
    : daysAgo(INITIAL_BACKFILL_DAYS);
  const from = ymd(fromDate);
  const to = ymd(new Date());

  let page = 1;
  let totalPages = 1;
  let latestDate: string | null = acc.sync_cursor_created_at;

  do {
    let batch: PluggyTransaction[];
    try {
      const res = await listTransactions({
        accountId: acc.provider_account_id,
        from,
        to,
        page,
        pageSize: BATCH_SIZE,
      });
      batch = res.results ?? [];
      totalPages = res.totalPages ?? 1;
    } catch (err) {
      if (err instanceof PluggyError && err.status === 404) {
        // Conta removida no provider — encerra a paginação para essa conta.
        break;
      }
      stats.errors++;
      throw err;
    }

    stats.fetched += batch.length;
    if (batch.length === 0) break;

    const payloads = batch.map((tx) => buildIngestPayload(acc, tx));

    const results = await pool(payloads, MAX_CONCURRENCY, async (payload) => {
      const { error } = await admin.rpc("ingest_of_transaction", { _payload: payload });
      if (error) return { ok: false, code: error.code ?? "err" };
      return { ok: true };
    });

    for (const r of results) {
      if (r.ok) stats.ingested++;
      else stats.errors++;
    }

    for (const tx of batch) {
      if (tx.date && (!latestDate || tx.date > latestDate)) latestDate = tx.date;
    }
    page++;
  } while (page <= totalPages && page <= 100); // hard cap defensivo

  stats.new_cursor = latestDate;

  if (latestDate && latestDate !== acc.sync_cursor_created_at) {
    await admin
      .from("open_finance_accounts")
      .update({
        sync_cursor_created_at: latestDate,
        last_synced_at: new Date().toISOString(),
        last_transaction_date: latestDate,
      })
      .eq("id", acc.id);
  } else {
    await admin
      .from("open_finance_accounts")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", acc.id);
  }

  return stats;
}

async function runSync(
  admin: SupabaseClient,
  connectionId: string,
  trigger: string,
) {
  // Carrega conexão + company_id.
  const { data: conn, error: connErr } = await admin
    .from("open_finance_connections")
    .select("id, company_id, is_active")
    .eq("id", connectionId)
    .maybeSingle();
  if (connErr) throw new Error(`db_conn_${connErr.code ?? "err"}`);
  if (!conn) throw new Error("connection_not_found");
  if (!conn.is_active) throw new Error("connection_inactive");

  // Claim lock (TTL 5 min).
  const { data: lockToken, error: lockErr } = await admin.rpc(
    "claim_open_finance_sync",
    {
      _connection_id: connectionId,
      _locked_by: "pluggy-sync",
      _ttl_seconds: LOCK_TTL_SECONDS,
    },
  );
  if (lockErr) throw new Error(`lock_err_${lockErr.code ?? "err"}`);
  if (!lockToken) {
    return { ok: false, error: "already_syncing" };
  }

  // Cria sync_run running.
  const { data: run, error: runErr } = await admin
    .from("open_finance_sync_runs")
    .insert({
      company_id: conn.company_id,
      connection_id: connectionId,
      trigger,
      status: "running",
    })
    .select("id")
    .single();
  if (runErr || !run) {
    await admin.rpc("release_open_finance_sync", {
      _connection_id: connectionId,
      _token: lockToken,
    });
    throw new Error(`run_insert_${runErr?.code ?? "err"}`);
  }

  const runId = run.id as string;
  const summary = {
    accounts_processed: 0,
    fetched: 0,
    ingested: 0,
    errors: 0,
    per_account: [] as PerAccountStats[],
    expired: 0,
    paired: 0,
  };
  let syncStatus: "success" | "partial" | "failed" = "success";
  let errorSummary: string | null = null;

  // Antes de ingerir: expira candidatos de transferência com janela vencida.
  try {
    const { data: expired } = await admin.rpc("expire_transfer_candidates", {
      _company_id: conn.company_id,
    });
    if (typeof expired === "number") summary.expired = expired;
  } catch (err) {
    console.error("[pluggy-sync] expire_error", {
      msg: err instanceof Error ? err.message.slice(0, 120) : "unknown",
    });
  }

  try {
    // Carrega contas elegíveis: ativas, vinculadas, auto_import.
    const { data: accounts, error: accErr } = await admin
      .from("open_finance_accounts")
      .select(
        "id, company_id, provider_account_id, provider_type, local_account_id, local_credit_card_id, sync_cursor_created_at, auto_import, is_active",
      )
      .eq("connection_id", connectionId)
      .eq("is_active", true)
      .eq("auto_import", true);
    if (accErr) throw new Error(`accounts_${accErr.code ?? "err"}`);

    const eligible = (accounts ?? []).filter(
      (a) =>
        (a.provider_type === "BANK" && a.local_account_id) ||
        (a.provider_type === "CREDIT" && a.local_credit_card_id),
    ) as OfAccountRow[];

    for (const acc of eligible) {
      try {
        const stats = await syncAccount(admin, acc);
        summary.per_account.push(stats);
        summary.accounts_processed++;
        summary.fetched += stats.fetched;
        summary.ingested += stats.ingested;
        summary.errors += stats.errors;
        if (stats.errors > 0) syncStatus = "partial";
      } catch (err) {
        summary.errors++;
        syncStatus = "partial";
        summary.per_account.push({
          of_account_id: acc.id,
          fetched: 0,
          ingested: 0,
          errors: 1,
          new_cursor: acc.sync_cursor_created_at,
        });
        console.error("[pluggy-sync] account_error", {
          of_account_id: acc.id,
          code: err instanceof PluggyError ? err.code : "unknown",
        });
      }
    }
  } catch (err) {
    syncStatus = "failed";
    errorSummary = err instanceof Error ? err.message.slice(0, 200) : "unknown";
    console.error("[pluggy-sync] fatal_run", { runId, msg: errorSummary });
  } finally {
    // Pareamento retroativo de transferências entre contas próprias (janela 5d).
    if (summary.ingested > 0) {
      try {
        const { data: paired } = await admin.rpc("pair_retro_transfers", {
          _company_id: conn.company_id,
          _connection_id: connectionId,
        });
        if (typeof paired === "number") summary.paired = paired;
      } catch (err) {
        console.error("[pluggy-sync] pair_error", {
          msg: err instanceof Error ? err.message.slice(0, 120) : "unknown",
        });
      }
    }

    // Persiste sync_run
    await admin
      .from("open_finance_sync_runs")
      .update({
        status: syncStatus,
        finished_at: new Date().toISOString(),
        accounts_found: summary.accounts_processed,
        transactions_found: summary.fetched,
        transactions_created: summary.ingested,
        error_count: summary.errors,
        per_account: summary.per_account,
        error_summary: errorSummary ? { message: errorSummary } : null,
      })
      .eq("id", runId);

    // Marca last_successful_sync_at se sucesso pleno.
    if (syncStatus === "success") {
      await admin
        .from("open_finance_connections")
        .update({
          last_successful_sync_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", connectionId);
    }

    // Libera lock
    await admin.rpc("release_open_finance_sync", {
      _connection_id: connectionId,
      _token: lockToken,
    });
  }

  return { ok: true, run_id: runId, status: syncStatus, ...summary };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const internalToken = req.headers.get("x-internal-token") ?? "";
    let authorized = false;
    let callerUid: string | null = null;

    if (internalToken && internalToken === SERVICE_ROLE) {
      authorized = true;
    } else if (authHeader.startsWith("Bearer ")) {
      const userClient = createClient(SUPABASE_URL, ANON, {
        global: { headers: { Authorization: authHeader } },
      });
      const token = authHeader.slice("Bearer ".length);
      const { data: claims } = await userClient.auth.getClaims(token);
      const uid = claims?.claims?.sub as string | undefined;
      if (uid) {
        callerUid = uid;
        const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
        // Aceita super_admin OU dono/admin da empresa alvo.
        const { data: isSuper } = await admin.rpc("has_role", {
          _user_id: uid,
          _role: "super_admin",
        });
        if (isSuper) authorized = true;
      }
    }

    const body = await req.json().catch(() => ({}));
    const connectionId = body?.connection_id as string | undefined;
    const trigger = (body?.trigger as string | undefined) ?? "manual";

    if (!connectionId) return json({ error: "connection_id_required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Se não é super_admin nem service_role, valida ownership da conexão.
    if (!authorized && callerUid) {
      const { data: conn } = await admin
        .from("open_finance_connections")
        .select("company_id")
        .eq("id", connectionId)
        .maybeSingle();
      if (conn) {
        const { data: owned } = await admin
          .from("companies")
          .select("id")
          .eq("id", conn.company_id)
          .eq("owner_id", callerUid)
          .maybeSingle();
        if (owned) authorized = true;
        if (!authorized) {
          const { data: member } = await admin
            .from("company_members")
            .select("role")
            .eq("company_id", conn.company_id)
            .eq("user_id", callerUid)
            .eq("is_active", true)
            .maybeSingle();
          if (member && ["admin", "manager", "owner"].includes(member.role as string)) {
            authorized = true;
          }
        }
      }
    }

    if (!authorized) return json({ error: "unauthorized" }, 401);

    const result = await runSync(admin, connectionId, trigger);
    return json(result);
  } catch (e) {
    console.error("[pluggy-sync] fatal", e);
    return json({ error: e instanceof Error ? e.message.slice(0, 200) : "unknown" }, 500);
  }
});
