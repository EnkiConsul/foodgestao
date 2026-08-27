// supabase/functions/asaas-webhook/index.ts
// Endpoint público (verify_jwt = false). Valida o header asaas-access-token.
//
// Este endpoint APENAS registra o evento na fila (inbox) `asaas_webhook_events`.
// O processamento é feito por `asaas-webhook-worker` (pg_cron a cada minuto),
// com tentativas, backoff exponencial e dead letter.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, asaas-access-token",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const expectedToken = Deno.env.get("ASAAS_WEBHOOK_TOKEN") ?? "";
    const receivedToken = req.headers.get("asaas-access-token") ?? "";
    if (!expectedToken || receivedToken !== expectedToken) {
      console.warn("asaas-webhook: invalid token");
      return new Response("Forbidden", { status: 403, headers: corsHeaders });
    }

    let payload: any;
    try {
      payload = await req.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const eventType: string = payload?.event ?? "";
    const eventId: string | null = payload?.id ?? null;

    // eventId é obrigatório: sem ele não há proteção contra evento duplicado.
    if (!eventId || typeof eventId !== "string" || !eventType) {
      console.error("asaas-webhook: missing event id/type", { eventType, hasId: !!eventId });
      return json({ error: "missing_event_id" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { error } = await admin.from("asaas_webhook_events").insert({
      event_id: eventId,
      event_type: eventType,
      payload,
      status: "pending",
      next_attempt_at: new Date().toISOString(),
    });

    if (error) {
      // 23505 = unique_violation → evento já recebido antes
      if (error.code === "23505" || String(error.message).includes("duplicate")) {
        return json({ ok: true, deduped: true });
      }
      console.error("asaas-webhook: enqueue error", error);
      return json({ error: "enqueue_failed" }, 500);
    }

    return json({ ok: true, queued: true });
  } catch (e) {
    console.error("asaas-webhook fatal:", e);
    return json({ error: "internal" }, 500);
  }
});
