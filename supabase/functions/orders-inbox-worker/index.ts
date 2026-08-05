// Worker do inbox: consome eventos externos e aplica no domínio canônico.
// Claim atômico com lease, retry com backoff, dead letter e métricas ficam
// no banco (`ped_inbox_claim` / `ped_inbox_complete` / `ped_inbox_fail`).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { getAdapter } from "../_shared/orders-integrations/registry.ts";
import {
  assertCompanyConsistency,
  classifyError,
  isOutOfOrder,
  sanitizeErrorMessage,
} from "../_shared/orders-integrations/core.ts";
import {
  PermanentIntegrationError,
  TransientIntegrationError,
  type CanonicalEvent,
} from "../_shared/orders-integrations/types.ts";
import { authorizeWorker } from "../_shared/orders-integrations/worker-auth.ts";

const WORKER = `inbox-${crypto.randomUUID().slice(0, 8)}`;
const LEASE_SECONDS = 90;
const HANDLER_TIMEOUT_MS = 20_000;

interface InboxRow {
  id: string;
  integration_id: string | null;
  company_id: string | null;
  unit_id: string | null;
  provider: string;
  external_event_id: string;
  external_order_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  attempts: number;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new TransientIntegrationError("timeout", "Processamento excedeu o tempo limite.")),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Aplica o evento canônico. Sem adaptador real ativo, nada é criado no domínio. */
async function applyEvent(
  admin: SupabaseClient,
  row: InboxRow,
  event: CanonicalEvent,
): Promise<{ orderId: string | null; ignored: boolean; result: Record<string, unknown> }> {
  if (!row.company_id || !row.integration_id) {
    throw new PermanentIntegrationError("integration_missing", "Evento sem integração vinculada.");
  }
  assertCompanyConsistency(
    typeof row.payload?.company_id === "string" ? row.payload.company_id : null,
    row.company_id,
  );

  if (event.type === "keepalive") {
    return { orderId: null, ignored: true, result: { keepalive: true } };
  }

  // Unidade é derivada da integração (ou do mapeamento externo), nunca do payload.
  let unitId = row.unit_id;
  if (!unitId && event.externalUnitId) {
    const { data } = await admin.rpc("ped_lookup_external", {
      p_integration_id: row.integration_id,
      p_entity_type: "unit",
      p_external_id: event.externalUnitId,
    });
    unitId = (data as string | null) ?? null;
  }
  if (!unitId) {
    throw new PermanentIntegrationError(
      "unit_unresolved",
      "Não foi possível resolver a unidade da integração.",
    );
  }

  const { data: unit, error: unitError } = await admin
    .from("ped_units")
    .select("id, company_id")
    .eq("id", unitId)
    .maybeSingle();
  if (unitError) throw new TransientIntegrationError("db_error", sanitizeErrorMessage(unitError));
  if (!unit || unit.company_id !== row.company_id) {
    throw new PermanentIntegrationError("unit_company_mismatch", "Unidade não pertence à empresa.");
  }

  // Idempotência de pedido: se o external_order_id já foi mapeado, reaproveita.
  let orderId: string | null = null;
  let appliedSequence: number | null = null;
  if (event.externalOrderId) {
    const { data: mapped } = await admin
      .from("ped_external_mappings")
      .select("internal_id, metadata")
      .eq("integration_id", row.integration_id)
      .eq("entity_type", "order")
      .eq("external_id", event.externalOrderId)
      .maybeSingle();
    orderId = (mapped?.internal_id as string | undefined) ?? null;
    const seq = (mapped?.metadata as Record<string, unknown> | undefined)?.sequence;
    appliedSequence = typeof seq === "number" ? seq : null;
  }

  if (isOutOfOrder(event.sequence ?? null, appliedSequence)) {
    return {
      orderId,
      ignored: true,
      result: { reason: "out_of_order", sequence: event.sequence, applied: appliedSequence },
    };
  }

  if (event.type === "order.created" && !orderId) {
    const { data: created, error: createError } = await admin.rpc("ped_create_order", {
      p_unit_id: unitId,
      p_items: (event.items ?? []).map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unit_price: item.unitPriceCents,
        notes: item.notes ?? null,
      })),
      p_order_type: event.delivery?.mode === "delivery" ? "delivery" : "pickup",
      p_customer_name: event.customer?.name ?? null,
      p_customer_phone: event.customer?.phone ?? null,
      p_notes: event.notes ?? null,
      p_is_test: true,
      p_external_order_id: event.externalOrderId ?? null,
      p_idempotency_key: `${row.provider}:${row.external_event_id}`,
    });
    if (createError) {
      const classified = classifyError(createError);
      if (classified.transient) {
        throw new TransientIntegrationError(classified.errorClass, classified.message);
      }
      throw new PermanentIntegrationError(classified.errorClass, classified.message);
    }
    const payload = created as { order_id?: string } | null;
    orderId = payload?.order_id ?? null;
  }

  if (orderId && event.externalOrderId) {
    await admin.rpc("ped_map_external", {
      p_integration_id: row.integration_id,
      p_entity_type: "order",
      p_external_id: event.externalOrderId,
      p_internal_id: orderId,
      p_metadata: { sequence: event.sequence ?? null, last_event: event.type },
    });
  }

  return {
    orderId,
    ignored: !orderId,
    result: { event_type: event.type, order_id: orderId, applied_at: new Date().toISOString() },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = authorizeWorker(req);
  if (!auth.ok) return json({ error: auth.code }, auth.status);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body?.limit) || 10, 1), 50);

    await admin.rpc("ped_queue_reap_expired", { p_worker: WORKER });

    const { data: claimed, error: claimError } = await admin.rpc("ped_inbox_claim", {
      p_worker: WORKER,
      p_limit: limit,
      p_lease_seconds: LEASE_SECONDS,
    });
    if (claimError) {
      console.error("inbox-worker: claim falhou", sanitizeErrorMessage(claimError));
      return json({ error: "claim_failed" }, 500);
    }

    const rows = (claimed ?? []) as InboxRow[];
    const metrics = { claimed: rows.length, done: 0, ignored: 0, retried: 0, dead: 0 };

    for (const row of rows) {
      const started = Date.now();
      try {
        const adapter = getAdapter(row.provider);
        const event = adapter.toCanonical(row.payload, {});
        const applied = await withTimeout(applyEvent(admin, row, event), HANDLER_TIMEOUT_MS);
        await admin.rpc("ped_inbox_complete", {
          p_id: row.id,
          p_result: applied.result,
          p_order_id: applied.orderId,
          p_duration_ms: Date.now() - started,
          p_worker: WORKER,
          p_ignored: applied.ignored,
        });
        if (applied.ignored) metrics.ignored += 1;
        else metrics.done += 1;
      } catch (error) {
        const classified = classifyError(error);
        const { data: failure } = await admin.rpc("ped_inbox_fail", {
          p_id: row.id,
          p_error_class: classified.errorClass,
          p_error_message: classified.message,
          p_transient: classified.transient,
          p_duration_ms: Date.now() - started,
          p_worker: WORKER,
        });
        const dead = (failure as { dead?: boolean } | null)?.dead === true;
        if (dead) metrics.dead += 1;
        else metrics.retried += 1;
        console.error(
          `inbox-worker: evento ${row.id} falhou class=${classified.errorClass} transient=${classified.transient} dead=${dead}`,
        );
      }
    }

    return json({ success: true, worker: WORKER, ...metrics });
  } catch (error) {
    console.error("inbox-worker: erro inesperado", sanitizeErrorMessage(error));
    return json({ error: "internal_error" }, 500);
  }
});
