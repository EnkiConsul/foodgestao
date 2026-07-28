// Admin-only: cria ou atualiza o webhook canônico na Pluggy, injetando o
// header X-360FOOD-WEBHOOK-TOKEN a partir de PLUGGY_WEBHOOK_TOKEN.
// Nunca retorna o valor do token nem os headers configurados.
//
// Autorização: header `x-admin-secret` deve bater com PLUGGY_CRON_TICK_SECRET
// (segredo interno já existente). Nenhum acesso do frontend/browser.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const WEBHOOK_HEADER_NAME = "X-360FOOD-WEBHOOK-TOKEN";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function timingSafeEqualText(expected: string, provided: string): boolean {
  const enc = new TextEncoder();
  const a = enc.encode(expected);
  const b = enc.encode(provided);
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a[i] ^ b[i];
  return out === 0;
}

async function pluggyApiKey(clientId: string, clientSecret: string): Promise<string> {
  const r = await fetch("https://api.pluggy.ai/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, clientSecret }),
  });
  if (!r.ok) throw new Error(`pluggy_auth_failed_${r.status}`);
  const data = await r.json();
  return data.apiKey as string;
}

async function listWebhooks(apiKey: string): Promise<any[]> {
  const r = await fetch("https://api.pluggy.ai/webhooks", { headers: { "X-API-KEY": apiKey } });
  if (!r.ok) throw new Error(`pluggy_list_failed_${r.status}`);
  const data = await r.json();
  return (data.results ?? data) as any[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const adminSecret = (Deno.env.get("PLUGGY_CRON_TICK_SECRET") ?? "").trim();
  const provided = (req.headers.get("x-admin-secret") ?? "").trim();
  if (!adminSecret || !provided || !timingSafeEqualText(adminSecret, provided)) {
    return json(401, { error: "unauthorized" });
  }

  const clientId = Deno.env.get("PLUGGY_CLIENT_ID");
  const clientSecret = Deno.env.get("PLUGGY_CLIENT_SECRET");
  const webhookToken = (Deno.env.get("PLUGGY_WEBHOOK_TOKEN") ?? "").trim();
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!clientId || !clientSecret || !webhookToken || !supabaseUrl) {
    return json(500, { error: "not_configured" });
  }

  const targetUrl = `${supabaseUrl}/functions/v1/pluggy-webhook`;
  const event = "all";
  const headers = { [WEBHOOK_HEADER_NAME]: webhookToken };

  try {
    const apiKey = await pluggyApiKey(clientId, clientSecret);
    const existing = await listWebhooks(apiKey);
    const canonical = existing.find((w) => w?.url === targetUrl);

    let webhookId: string | null = null;
    if (canonical?.id) {
      const r = await fetch(`https://api.pluggy.ai/webhooks/${canonical.id}`, {
        method: "PATCH",
        headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl, event, headers, enabled: true }),
      });
      if (!r.ok) return json(502, { error: "pluggy_patch_failed", status: r.status });
      const data = await r.json();
      webhookId = data.id ?? canonical.id;
    } else {
      const r = await fetch("https://api.pluggy.ai/webhooks", {
        method: "POST",
        headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl, event, headers, enabled: true }),
      });
      if (!r.ok) return json(502, { error: "pluggy_create_failed", status: r.status });
      const data = await r.json();
      webhookId = data.id ?? null;
    }

    const duplicates = existing
      .filter((w) => w?.url === targetUrl && w?.id !== webhookId)
      .map((w) => ({ id: w.id, enabled: !!w.enabled }));

    return json(200, {
      configured: true,
      webhook_id: webhookId,
      event,
      enabled: true,
      has_auth_header: true,
      duplicates,
    });
  } catch (err) {
    console.error("[pluggy-webhook-configure]", (err as Error).message);
    return json(500, { error: "configure_failed" });
  }
});
