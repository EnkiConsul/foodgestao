// V2 — Worker durável de webhooks
// Claim atômico via RPC pluggy_v2_webhook_claim; processa cada evento e finaliza
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { materializePluggyItemV2 } from "../_shared/pluggy-v2-materialize.ts";

Deno.serve(async (req) => {
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

  // Autoriza via cron secret (fail-closed)
  const secret = Deno.env.get("PLUGGY_V2_CRON_TICK_SECRET");
  if (!secret) return json({ error: "server_misconfigured" }, 500);
  const provided = req.headers.get("x-cron-secret") ?? "";
  if (provided !== secret) return json({ error: "unauthorized" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const workerId = `worker-${crypto.randomUUID().slice(0, 8)}`;
  const batchSize = 10;

  const { data: batch, error } = await supabase.rpc("pluggy_v2_webhook_claim", {
    p_worker_id: workerId,
    p_batch_size: batchSize,
    p_lease_seconds: 120,
  });
  if (error) return json({ error: "claim_failed", detail: error.message }, 500);

  const events = (batch ?? []) as Array<{
    id: string;
    event_type: string;
    pluggy_item_id: string | null;
    payload: Record<string, unknown>;
  }>;

  let processed = 0;
  let failed = 0;

  for (const ev of events) {
    try {
      await processEvent(supabase, ev);
      await supabase.rpc("pluggy_v2_webhook_finalize_success", {
        p_event_id: ev.id,
        p_worker_id: workerId,
      });
      processed++;
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      await supabase.rpc("pluggy_v2_webhook_finalize_failure", {
        p_event_id: ev.id,
        p_worker_id: workerId,
        p_error: msg.slice(0, 500),
      });
      failed++;
      console.error(`[pv2-worker] event ${ev.id} failed:`, msg);
    }
  }

  return json({ ok: true, worker: workerId, claimed: events.length, processed, failed });
});

// deno-lint-ignore no-explicit-any
async function processEvent(supabase: any, ev: {
  id: string;
  event_type: string;
  pluggy_item_id: string | null;
  payload: Record<string, unknown>;
}) {
  const type = ev.event_type;
  const itemId = ev.pluggy_item_id;
  if (!itemId) {
    // Sem itemId: nada a materializar; sucesso vazio
    return;
  }

  // Localiza companyId via connect_requests OU connections existente
  let companyId: string | null = null;
  let createdBy: string | null = null;

  const { data: reqRow } = await supabase
    .from("pluggy_v2_connect_requests")
    .select("company_id, user_id")
    .or(`pluggy_item_id.eq.${itemId},target_item_id.eq.${itemId}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (reqRow) {
    companyId = reqRow.company_id;
    createdBy = reqRow.user_id;

    // Vincula item_id à request se ainda não vinculado
    await supabase
      .from("pluggy_v2_connect_requests")
      .update({ pluggy_item_id: itemId, status: "item_linked", updated_at: new Date().toISOString() })
      .eq("company_id", companyId)
      .is("pluggy_item_id", null)
      .eq("user_id", reqRow.user_id);
  } else {
    const { data: connRow } = await supabase
      .from("pluggy_v2_connections")
      .select("company_id, created_by")
      .eq("pluggy_item_id", itemId)
      .maybeSingle();
    if (connRow) {
      companyId = connRow.company_id;
      createdBy = connRow.created_by;
    }
  }

  if (!companyId) {
    // Item órfão — pode ser um evento antes de mapearmos a request; deixamos re-tentar
    throw new Error(`orphan_item:${itemId}`);
  }

  // Estratégia por tipo de evento
  if (type === "item/deleted" || type === "item/error") {
    await supabase
      .from("pluggy_v2_connections")
      .update({
        status: type === "item/deleted" ? "deleted" : "error",
        deleted_at: type === "item/deleted" ? new Date().toISOString() : null,
        status_detail: ev.payload,
        updated_at: new Date().toISOString(),
      })
      .eq("pluggy_item_id", itemId);
    return;
  }

  if (type === "item/waiting_user_input") {
    await supabase
      .from("pluggy_v2_connections")
      .update({
        status: "waiting_user_input",
        mfa_pending: true,
        status_detail: ev.payload,
        updated_at: new Date().toISOString(),
      })
      .eq("pluggy_item_id", itemId);
    return;
  }

  // Fluxo padrão: item/created, item/updated, transactions/created, item/login_succeeded
  await materializePluggyItemV2({
    supabase,
    pluggyItemId: itemId,
    companyId,
    createdBy,
    triggerSource: "webhook",
    sourceWebhookEventId: ev.id,
    fullSync: type === "item/created",
  });

  // Marca request como completed
  await supabase
    .from("pluggy_v2_connect_requests")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("pluggy_item_id", itemId)
    .in("status", ["token_created", "item_linked"]);
}
