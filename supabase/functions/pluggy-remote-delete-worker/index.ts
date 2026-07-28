// Worker durável para retry de DELETE /items/{id} na Pluggy.
//
// Fluxo:
//   1. Autentica via x-cron-secret ou x-worker-secret == PLUGGY_CRON_TICK_SECRET.
//   2. Reserva um lote via RPC pluggy_remote_delete_claim (FOR UPDATE SKIP LOCKED).
//   3. Para cada conexão: chama deleteItem(). 404 na Pluggy é sucesso (item já sumiu).
//   4. Em sucesso: pluggy_remote_delete_finalize_success.
//   5. Em falha: pluggy_remote_delete_finalize_failure (backoff exponencial, dead-letter após 10 tentativas).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { deleteItem, safePluggyError } from "../_shared/pluggy-client.ts";

const MAX_ATTEMPTS = 10;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function timingSafeEqualText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const expected = Deno.env.get("PLUGGY_CRON_TICK_SECRET");
  const provided = req.headers.get("x-cron-secret") ?? req.headers.get("x-worker-secret") ?? "";
  if (!expected || !timingSafeEqualText(provided, expected)) {
    return json(401, { error: "unauthenticated" });
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(url, service);

  let batch = 10;
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body?.batch === "number" && body.batch > 0 && body.batch <= 50) batch = body.batch;
  } catch { /* ignore */ }

  const { data: claimed, error: claimErr } = await supabase.rpc("pluggy_remote_delete_claim", {
    _batch: batch,
    _lease_seconds: 90,
  });
  if (claimErr) {
    console.error("[pluggy-remote-delete-worker] claim failed", claimErr);
    return json(500, { error: "claim_failed", detail: claimErr.message });
  }
  const rows = (claimed ?? []) as Array<{ id: string; pluggy_item_id: string; remote_delete_attempts: number }>;

  const results = {
    processed: rows.length,
    succeeded: 0,
    failed: 0,
    dead_letter: 0,
    details: [] as Array<{ id: string; status: "ok" | "already" | "failed"; error?: string; attempts?: number }>,
  };

  for (const row of rows) {
    try {
      const result = await deleteItem(row.pluggy_item_id);
      const notFound = !result.ok && result.httpStatus === 404;
      if (result.ok || notFound) {
        await supabase.rpc("pluggy_remote_delete_finalize_success", { _id: row.id });
        results.succeeded += 1;
        results.details.push({ id: row.id, status: notFound ? "already" : "ok" });
        continue;
      }
      const errMsg = safePluggyError(result.error, result.httpStatus);
      await supabase.rpc("pluggy_remote_delete_finalize_failure", {
        _id: row.id,
        _error: errMsg,
        _max_attempts: MAX_ATTEMPTS,
      });
      const nextAttempts = row.remote_delete_attempts + 1;
      const dead = nextAttempts >= MAX_ATTEMPTS;
      if (dead) results.dead_letter += 1;
      results.failed += 1;
      results.details.push({ id: row.id, status: "failed", error: errMsg, attempts: nextAttempts });
    } catch (err) {
      const msg = String((err as Error)?.message ?? err).slice(0, 500);
      console.error("[pluggy-remote-delete-worker] delete crashed", row.id, msg);
      await supabase.rpc("pluggy_remote_delete_finalize_failure", {
        _id: row.id,
        _error: msg,
        _max_attempts: MAX_ATTEMPTS,
      });
      results.failed += 1;
      results.details.push({ id: row.id, status: "failed", error: msg });
    }
  }

  return json(200, results);
});
