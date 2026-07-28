// Worker durável: reserva atomicamente eventos elegíveis de
// open_finance_webhook_events, processa via processor puro e finaliza com
// success/failure usando as RPCs pluggy_webhook_finalize_*.
//
// Autenticação: header x-worker-secret === PLUGGY_CRON_TICK_SECRET.
// Disparado por: pluggy-webhook (fire-and-forget), pluggy-webhook-drain (cron),
// ou chamada manual pelo backoffice.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { processWebhookEvent, type WebhookRow } from "../_shared/pluggy-webhook-processor.ts";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const DEFAULT_BATCH = 5;
const LEASE_SECONDS = 60;
const MAX_RUNTIME_MS = 40_000; // budget seguro < 60s do Edge Runtime

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const expected = Deno.env.get("PLUGGY_CRON_TICK_SECRET");
  const provided = req.headers.get("x-worker-secret") ?? req.headers.get("x-cron-secret") ?? "";
  if (!expected || provided !== expected) return json(401, { error: "unauthenticated" });

  let body: { batch?: number; workerId?: string } = {};
  try { body = await req.json(); } catch { /* opcional */ }

  const batchSize = Math.min(Math.max(Number(body.batch ?? DEFAULT_BATCH) || DEFAULT_BATCH, 1), 25);
  const workerId = body.workerId ?? `worker-${crypto.randomUUID()}`;

  const url = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(url, service);

  const startedAt = Date.now();
  let claimed = 0;
  let processed = 0;
  let failed = 0;
  let deadLetter = 0;

  while (Date.now() - startedAt < MAX_RUNTIME_MS) {
    const { data: events, error: claimErr } = await supabase.rpc("pluggy_webhook_claim", {
      p_worker_id: workerId,
      p_batch_size: batchSize,
      p_lease_seconds: LEASE_SECONDS,
    });

    if (claimErr) {
      console.error("[pluggy-worker] claim error", claimErr);
      return json(500, { error: "claim_failed", detail: claimErr.message });
    }

    const rows = (events ?? []) as WebhookRow[];
    if (rows.length === 0) break;
    claimed += rows.length;

    for (const row of rows) {
      const result = await processWebhookEvent(supabase, row);

      // Atualiza contexto do evento (não altera status — RPC finaliza).
      const contextPatch: Record<string, unknown> = {};
      if (result.connectionId !== undefined) contextPatch.connection_id = result.connectionId;
      if (result.companyId !== undefined) contextPatch.company_id = result.companyId;
      if (result.clientUserId !== undefined) contextPatch.client_user_id = result.clientUserId;
      if (Object.keys(contextPatch).length > 0) {
        await supabase.from("open_finance_webhook_events").update(contextPatch).eq("id", row.id);
      }

      if (result.ok) {
        const { data: ok } = await supabase.rpc("pluggy_webhook_finalize_success", {
          p_event_id: row.id,
          p_worker_id: workerId,
        });
        if (ok) processed++;
      } else if (result.transient) {
        const { data: status } = await supabase.rpc("pluggy_webhook_finalize_failure", {
          p_event_id: row.id,
          p_worker_id: workerId,
          p_error: result.errorMessage ?? result.errorCode ?? "unknown",
          p_error_code: result.errorCode ?? null,
        });
        if (status === "dead_letter") deadLetter++; else failed++;
      } else {
        // Erro não-transiente: envia direto para dead_letter atualizando o max_attempts.
        await supabase.from("open_finance_webhook_events").update({ max_attempts: 1 }).eq("id", row.id);
        const { data: status } = await supabase.rpc("pluggy_webhook_finalize_failure", {
          p_event_id: row.id,
          p_worker_id: workerId,
          p_error: result.errorMessage ?? result.errorCode ?? "unknown",
          p_error_code: result.errorCode ?? null,
        });
        if (status === "dead_letter") deadLetter++; else failed++;
      }
    }

    // Batch menor que o solicitado = fila esvaziou.
    if (rows.length < batchSize) break;
  }

  return json(200, {
    worker_id: workerId,
    claimed,
    processed,
    failed,
    dead_letter: deadLetter,
    elapsed_ms: Date.now() - startedAt,
  });
});
