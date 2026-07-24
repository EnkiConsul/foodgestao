// pluggy-worker
// Processa eventos da fila `open_finance_webhook_events` gerada pelo receiver
// (pluggy-webhook). Este worker NÃO ingere transações — a ingestão completa
// (Blocos 5/7) roda em `pluggy-sync`, que este worker agenda quando aplicável.
//
// Responsabilidades:
//   - Reivindicar N eventos pendentes/retry via SELECT ... FOR UPDATE SKIP LOCKED.
//   - Buscar o item na Pluggy (getItem) e atualizar `open_finance_connections`
//     (status, execução, erro, timestamps, próximo auto-sync).
//   - Marcar o evento como `processed` (ok), `retry` (falha transitória, com
//     backoff exponencial) ou `failed` (após 5 tentativas).
//   - Nunca logar payload cru, secrets ou IDs de conexão externos.
//
// Autenticação: JWT obrigatório e o chamador precisa ser super_admin OU
// service-role via header (uso interno por cron).

import { createClient } from "npm:@supabase/supabase-js@2";
import { getItem, PluggyError, type PluggyItem } from "../_shared/pluggy.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const MAX_ATTEMPTS = 5;
const DEFAULT_BATCH = 10;

// Backoff exponencial: 30s, 2m, 8m, 30m, 2h.
function nextAttemptAt(attempt: number): string {
  const table = [30, 120, 480, 1800, 7200];
  const secs = table[Math.min(attempt, table.length - 1)];
  return new Date(Date.now() + secs * 1000).toISOString();
}

type WebhookRow = {
  id: string;
  event_type: string;
  provider_item_id: string | null;
  provider_account_id: string | null;
  connection_id: string | null;
  company_id: string | null;
  attempt_count: number;
  payload: Record<string, unknown>;
};

// Mapeia o status/executionStatus do item Pluggy para nossa coluna item_status
// e para is_active/needs-reconnect quando aplicável.
function mapConnectionUpdate(item: PluggyItem) {
  const status = String(item.status ?? "").toUpperCase();
  const consentExpiresAt = item.consentExpiresAt ?? null;
  const consentExpired =
    !!consentExpiresAt && new Date(consentExpiresAt).getTime() < Date.now();
  const needsReconnect =
    status === "LOGIN_ERROR" ||
    status === "WAITING_USER_INPUT" ||
    status === "USER_INPUT_TIMEOUT" ||
    status === "OUTDATED" ||
    consentExpired;
  const success = status === "UPDATED";
  return {
    connector_id: item.connector?.id != null ? String(item.connector.id) : null,
    institution_name: item.connector?.name ?? null,
    institution_logo_url: item.connector?.imageUrl ?? null,
    institution_primary_color: item.connector?.primaryColor ?? null,
    item_status: item.status ?? null,
    execution_status: item.executionStatus ?? null,
    provider_error_code: item.error?.code ?? null,
    provider_error_message: item.error?.message ?? null,
    last_sync_at: item.lastUpdatedAt ?? new Date().toISOString(),
    last_successful_sync_at: success
      ? item.lastUpdatedAt ?? new Date().toISOString()
      : undefined,
    next_auto_sync_at: item.nextAutoSyncAt ?? null,
    consent_expires_at: consentExpiresAt,
    needs_reconnect: needsReconnect,
  };
}

async function processEvent(
  admin: ReturnType<typeof createClient>,
  ev: WebhookRow,
): Promise<{ status: "processed" | "retry" | "failed"; error?: string; scheduleSync?: boolean }> {
  const itemId = ev.provider_item_id;

  // Eventos que não têm itemId (ex.: connector/status_updated globais) apenas
  // são registrados como processados — nada a fazer no worker atual.
  if (!itemId) return { status: "processed" };

  // Resolve/garante a conexão local para este itemId.
  let connectionId = ev.connection_id;
  let companyId = ev.company_id;
  if (!connectionId) {
    const { data: conn } = await admin
      .from("open_finance_connections")
      .select("id, company_id")
      .eq("provider", "pluggy")
      .eq("provider_item_id", itemId)
      .maybeSingle();
    if (conn) {
      connectionId = conn.id as string;
      companyId = conn.company_id as string;
    }
  }

  // Sem conexão local ainda? Item pode ter sido criado antes do frontend
  // registrar. Aguarda retry (o frontend chamará /pluggy-item-register logo em
  // seguida no Bloco 5). Isso NÃO é falha — apenas retry curto.
  if (!connectionId) {
    return { status: "retry", error: "connection_not_registered" };
  }

  // Evento de consentimento revogado: desativa a conexão localmente sem
  // depender de um próximo getItem retornar 404.
  if (ev.event_type === "consent/revoked") {
    await admin
      .from("open_finance_connections")
      .update({
        is_active: false,
        disconnected_at: new Date().toISOString(),
        needs_reconnect: true,
        item_status: "CONSENT_REVOKED",
        updated_at: new Date().toISOString(),
      })
      .eq("id", connectionId);
    return { status: "processed" };
  }

  // Busca metadados atualizados do item na Pluggy.
  let item: PluggyItem;
  try {
    item = await getItem(itemId);
  } catch (err) {
    if (err instanceof PluggyError) {
      // 404 = item removido no provedor: desativa conexão localmente.
      if (err.status === 404) {
        await admin
          .from("open_finance_connections")
          .update({
            is_active: false,
            disconnected_at: new Date().toISOString(),
            item_status: "DELETED",
            updated_at: new Date().toISOString(),
          })
          .eq("id", connectionId);
        return { status: "processed" };
      }
      // 4xx (não 404/429): falha permanente.
      if (err.status >= 400 && err.status < 500 && err.status !== 429) {
        return { status: "failed", error: err.code };
      }
    }
    return { status: "retry", error: (err as Error).message?.slice(0, 200) };
  }

  const patch = mapConnectionUpdate(item);
  // Remove chaves undefined para não zerar last_successful_sync_at à toa.
  const cleanPatch = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined),
  );
  const { error: upErr } = await admin
    .from("open_finance_connections")
    .update({ ...cleanPatch, updated_at: new Date().toISOString() })
    .eq("id", connectionId);
  if (upErr) return { status: "retry", error: `db_${upErr.code ?? "err"}` };

  // Eventos que devem disparar uma sincronização de transações (Bloco 5+).
  const scheduleSync =
    ev.event_type === "item/updated" ||
    ev.event_type === "transactions/created" ||
    ev.event_type === "transactions/updated" ||
    ev.event_type === "transactions/deleted";

  // Dispara `pluggy-sync` (fire-and-forget) para essa conexão. O sync tem lock
  // cooperativo próprio, então múltiplos eventos concorrentes convergem.
  if (scheduleSync && companyId) {
    try {
      const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/pluggy-sync`;
      const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      // Fire-and-forget: não aguarda o término do sync para não travar o worker.
      fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-token": service,
          Authorization: `Bearer ${service}`,
        },
        body: JSON.stringify({
          connection_id: connectionId,
          trigger: `webhook:${ev.event_type}`,
        }),
      }).catch((e) => console.error("[pluggy-worker] sync_dispatch_failed", {
        msg: e instanceof Error ? e.message.slice(0, 120) : "unknown",
      }));
    } catch (e) {
      console.error("[pluggy-worker] sync_dispatch_error", {
        msg: e instanceof Error ? e.message.slice(0, 120) : "unknown",
      });
    }
  }

  return { status: "processed", scheduleSync };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Autorização: aceita chamador com JWT super_admin OU header interno com
    // service role (uso via cron interno).
    const authHeader = req.headers.get("Authorization") ?? "";
    const internalToken = req.headers.get("x-internal-token") ?? "";
    let authorized = false;

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
        const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
        const { data: isAdmin } = await admin.rpc("has_role", {
          _user_id: uid,
          _role: "super_admin",
        });
        authorized = Boolean(isAdmin);
      }
    }

    if (!authorized) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const batch = Math.min(50, Math.max(1, Number(body?.batch) || DEFAULT_BATCH));

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Reivindica lote atomicamente. Postgres não expõe SKIP LOCKED direto via
    // PostgREST, então usamos uma UPDATE ... RETURNING com uma subquery.
    const nowIso = new Date().toISOString();
    const { data: claimed, error: claimErr } = await admin.rpc(
      "claim_pluggy_webhook_events",
      { _batch: batch, _now: nowIso },
    );

    if (claimErr) {
      console.error("[pluggy-worker] claim_failed", { code: claimErr.code });
      return json({ error: "claim_failed" }, 500);
    }

    const events: WebhookRow[] = Array.isArray(claimed) ? claimed : [];
    const summary = { processed: 0, retry: 0, failed: 0, total: events.length };

    for (const ev of events) {
      const result = await processEvent(admin, ev);
      const attempt = (ev.attempt_count ?? 0) + 1;
      if (result.status === "processed") {
        summary.processed++;
        await admin
          .from("open_finance_webhook_events")
          .update({
            status: "processed",
            processed_at: new Date().toISOString(),
            attempt_count: attempt,
            error: null,
            next_attempt_at: null,
          })
          .eq("id", ev.id);
      } else if (result.status === "retry" && attempt < MAX_ATTEMPTS) {
        summary.retry++;
        await admin
          .from("open_finance_webhook_events")
          .update({
            status: "retry",
            attempt_count: attempt,
            error: result.error?.slice(0, 200) ?? null,
            next_attempt_at: nextAttemptAt(attempt),
            processing_started_at: null,
          })
          .eq("id", ev.id);
      } else {
        summary.failed++;
        await admin
          .from("open_finance_webhook_events")
          .update({
            status: "failed",
            attempt_count: attempt,
            error: result.error?.slice(0, 200) ?? "max_attempts",
            next_attempt_at: null,
            processed_at: new Date().toISOString(),
          })
          .eq("id", ev.id);
      }
    }

    return json({ ok: true, ...summary });
  } catch (e) {
    console.error("[pluggy-worker] fatal", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
