// Receiver de webhooks de canais externos do módulo Pedidos.
// Não confia em nada do payload: empresa/unidade vêm da integração.
// Fail closed: sem integração ativa ou assinatura válida, nada é enfileirado.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getAdapter, hasAdapter } from "../_shared/orders-integrations/registry.ts";
import {
  headersToObject,
  sanitizeErrorMessage,
  sanitizePayload,
} from "../_shared/orders-integrations/core.ts";

const MAX_BODY_BYTES = 512 * 1024;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const url = new URL(req.url);
    const integrationId = url.searchParams.get("integration_id")?.trim() ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(integrationId)) {
      return json({ error: "invalid_integration" }, 400);
    }

    const rawBody = await req.text();
    if (!rawBody || rawBody.length > MAX_BODY_BYTES) {
      return json({ error: "invalid_body" }, 400);
    }

    const { data: integration, error: intError } = await admin
      .from("ped_order_integrations")
      .select("id, company_id, unit_id, provider, status, secret_name, signature_header")
      .eq("id", integrationId)
      .maybeSingle();

    // Resposta genérica: nunca revela existência/estado da integração.
    if (intError || !integration) return json({ received: true }, 202);
    if (!["sandbox", "active"].includes(integration.status)) return json({ received: true }, 202);
    if (!hasAdapter(integration.provider)) return json({ received: true }, 202);

    const headers = headersToObject(req.headers);
    const adapter = getAdapter(integration.provider);
    const secret = integration.secret_name ? Deno.env.get(integration.secret_name) ?? null : null;

    const signatureValid = await adapter.verifySignature({ rawBody, headers, secret });
    if (!signatureValid) {
      console.warn(
        `receiver: assinatura inválida integration=${integration.id} provider=${integration.provider}`,
      );
      return json({ error: "unauthorized" }, 401);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const externalEventId = adapter.externalEventId(parsed, headers);
    if (!externalEventId) return json({ error: "missing_event_id" }, 400);

    const body = (parsed ?? {}) as Record<string, unknown>;
    const eventType = typeof body.event_type === "string" ? body.event_type : "unknown";
    const externalOrderId = typeof body.order_id === "string" ? body.order_id : null;
    const occurredAt = typeof body.occurred_at === "string" ? body.occurred_at : null;

    const { data, error } = await admin.rpc("ped_inbox_enqueue", {
      p_integration_id: integration.id,
      p_external_event_id: externalEventId,
      p_event_type: eventType,
      p_payload: sanitizePayload(parsed) as Record<string, unknown>,
      p_signature_valid: true,
      p_external_order_id: externalOrderId,
      p_occurred_at: occurredAt,
    });

    if (error) {
      console.error("receiver: falha ao enfileirar", sanitizeErrorMessage(error));
      return json({ error: "enqueue_failed" }, 500);
    }

    const result = data as { accepted?: boolean; code?: string };
    if (!result?.accepted) return json({ error: result?.code ?? "rejected" }, 400);

    return json({ received: true, code: result.code }, 202);
  } catch (error) {
    console.error("receiver: erro inesperado", sanitizeErrorMessage(error));
    return json({ error: "internal_error" }, 500);
  }
});
