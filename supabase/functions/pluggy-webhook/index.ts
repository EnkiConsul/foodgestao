// pluggy-webhook: recebe eventos do Pluggy e atualiza bank_connections + sincroniza.
// Público (verify_jwt=false). Autenticação via header X-Webhook-Secret == PLUGGY_WEBHOOK_SECRET.
import { createClient } from "npm:@supabase/supabase-js@2";
import { syncConnection } from "../pluggy-sync-item/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret, x-pluggy-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const expected = Deno.env.get("PLUGGY_WEBHOOK_SECRET") ?? "";
  const provided =
    req.headers.get("x-webhook-secret") ??
    req.headers.get("x-pluggy-signature") ??
    "";
  if (!expected || provided !== expected) {
    console.warn("[pluggy-webhook] invalid secret");
    return json(401, { error: "Unauthorized" });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  const event: string = payload?.event ?? payload?.type ?? "";
  const itemId: string | undefined = payload?.itemId ?? payload?.item?.id;
  const errorMsg: string | undefined =
    payload?.error?.message ?? payload?.error?.code ?? payload?.message;

  console.log("[pluggy-webhook] event=%s itemId=%s", event, itemId);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // Eventos informativos sem itemId
    if (event.startsWith("connector/") || !itemId) {
      return json(200, { received: true, ignored: true, event });
    }

    const { data: conn } = await admin
      .from("bank_connections")
      .select("*")
      .eq("provider", "pluggy")
      .eq("provider_item_id", itemId)
      .maybeSingle();

    if (!conn) {
      console.warn("[pluggy-webhook] connection not found for itemId", itemId);
      return json(200, { received: true, ignored: true, reason: "connection_not_found" });
    }

    switch (event) {
      case "item/updated":
      case "item/created": {
        // Marca ativo e dispara sync das transações
        await admin.from("bank_connections").update({
          status: "active",
          last_error: null,
        }).eq("id", conn.id);
        try {
          const result = await syncConnection(admin, conn.id);
          return json(200, { received: true, event, synced: result });
        } catch (e) {
          console.error("[pluggy-webhook] sync failed", e);
          return json(200, { received: true, event, sync_error: (e as Error).message });
        }
      }
      case "item/login_succeeded": {
        await admin.from("bank_connections").update({
          status: "active",
          last_error: null,
        }).eq("id", conn.id);
        return json(200, { received: true, event });
      }
      case "item/error":
      case "item/login_error": {
        await admin.from("bank_connections").update({
          status: "login_error",
          last_error: errorMsg ?? `Pluggy: ${event}`,
        }).eq("id", conn.id);
        return json(200, { received: true, event });
      }
      case "item/waiting_user_input": {
        await admin.from("bank_connections").update({
          status: "waiting_user_input",
          last_error: "Requer nova autenticação/MFA no banco",
        }).eq("id", conn.id);
        return json(200, { received: true, event });
      }
      case "item/deleted": {
        await admin.from("bank_connections").update({
          status: "deleted",
        }).eq("id", conn.id);
        return json(200, { received: true, event });
      }
      default:
        return json(200, { received: true, ignored: true, event });
    }
  } catch (e) {
    console.error("[pluggy-webhook]", e);
    return json(500, { error: (e as Error).message });
  }
});
