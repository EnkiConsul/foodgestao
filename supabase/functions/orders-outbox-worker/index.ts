// Worker do outbox: entrega ações internas aos canais externos.
// Nunca envia dados sensíveis do cliente além do necessário; usa lease,
// backoff exponencial e dead letter após esgotar as tentativas.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getAdapter } from "../_shared/orders-integrations/registry.ts";
import {
  classifyError,
  sanitizeErrorMessage,
  sanitizePayload,
} from "../_shared/orders-integrations/core.ts";
import { TransientIntegrationError } from "../_shared/orders-integrations/types.ts";
import { authorizeWorker } from "../_shared/orders-integrations/worker-auth.ts";

const WORKER = `outbox-${crypto.randomUUID().slice(0, 8)}`;
const LEASE_SECONDS = 90;
const SEND_TIMEOUT_MS = 15_000;

interface OutboxRow {
  id: string;
  integration_id: string;
  company_id: string;
  unit_id: string | null;
  provider: string;
  operation: string;
  order_id: string | null;
  external_order_id: string | null;
  payload: Record<string, unknown>;
  attempts: number;
  config: Record<string, unknown> | null;
  secret_name: string | null;
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
      () => reject(new TransientIntegrationError("timeout", "Envio excedeu o tempo limite.")),
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = await authorizeWorker(req, "orders-outbox-worker");
  if (!auth.ok) return json({ error: auth.code }, auth.status);


  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body?.limit) || 10, 1), 50);

    await admin.rpc("ped_queue_reap_expired", { p_worker: WORKER });

    const { data: claimed, error: claimError } = await admin.rpc("ped_outbox_claim", {
      p_worker: WORKER,
      p_limit: limit,
      p_lease_seconds: LEASE_SECONDS,
    });
    if (claimError) {
      console.error("outbox-worker: claim falhou", sanitizeErrorMessage(claimError));
      return json({ error: "claim_failed" }, 500);
    }

    const rows = (claimed ?? []) as OutboxRow[];
    const metrics = { claimed: rows.length, sent: 0, retried: 0, dead: 0 };

    for (const row of rows) {
      const started = Date.now();
      try {
        const adapter = getAdapter(row.provider);
        const result = await withTimeout(
          adapter.send(
            {
              operation: row.operation,
              orderId: row.order_id,
              externalOrderId: row.external_order_id,
              payload: row.payload ?? {},
            },
            {
              integrationId: row.integration_id,
              companyId: row.company_id,
              unitId: row.unit_id,
              provider: row.provider as never,
              config: row.config ?? {},
              secret: row.secret_name ? Deno.env.get(row.secret_name) ?? null : null,
            },
          ),
          SEND_TIMEOUT_MS,
        );

        await admin.rpc("ped_outbox_complete", {
          p_id: row.id,
          p_external_ref: result.externalRef ?? null,
          p_result: sanitizePayload(result.result ?? {}) as Record<string, unknown>,
          p_duration_ms: Date.now() - started,
          p_worker: WORKER,
        });
        metrics.sent += 1;
      } catch (error) {
        const classified = classifyError(error);
        const { data: failure } = await admin.rpc("ped_outbox_fail", {
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
          `outbox-worker: mensagem ${row.id} falhou class=${classified.errorClass} transient=${classified.transient} dead=${dead}`,
        );
      }
    }

    return json({ success: true, worker: WORKER, ...metrics });
  } catch (error) {
    console.error("outbox-worker: erro inesperado", sanitizeErrorMessage(error));
    return json({ error: "internal_error" }, 500);
  }
});
