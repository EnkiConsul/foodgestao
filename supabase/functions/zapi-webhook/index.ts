/**
 * Recebe da Z-API os status das mensagens (entregue/lido) e atualiza
 * dp_whatsapp_envios. Autorizado pelo segredo `k` na URL.
 * POST {acao:"configurar"} com JWT de super admin registra este endpoint na Z-API.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { timingSafeEqualHex } from "../_shared/zapi.ts";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "método inválido" });

  const url = new URL(req.url);
  const secret = Deno.env.get("ZAPI_WEBHOOK_SECRET") ?? "";
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const body = await req.json().catch(() => ({}));

  if (body?.acao === "configurar") {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: u } = await admin.auth.getUser(token);
    if (!u?.user) return json(401, { error: "não autenticado" });
    const { data: ok } = await admin.rpc("has_role", { _user_id: u.user.id, _role: "super_admin" });
    if (!ok) return json(403, { error: "somente super admin" });
    const inst = Deno.env.get("Z_API_INSTANCE_ID"), tk = Deno.env.get("Z_API_TOKEN"), ct = Deno.env.get("Z_API_CLIENT_TOKEN");
    if (!inst || !tk || !ct || !secret) return json(500, { error: "configuração incompleta" });
    const destino = `${Deno.env.get("SUPABASE_URL")}/functions/v1/zapi-webhook?k=${secret}`;
    const r = await fetch(`https://api.z-api.io/instances/${inst}/token/${tk}/update-webhook-message-status`, {
      method: "PUT", headers: { "Content-Type": "application/json", "Client-Token": ct },
      body: JSON.stringify({ value: destino }),
    });
    return json(r.ok ? 200 : 502, { ok: r.ok, status: r.status });
  }

  const k = url.searchParams.get("k") ?? "";
  if (!secret || k.length !== secret.length || !timingSafeEqualHex(k, secret)) return json(401, { error: "não autorizado" });

  const status = String(body?.status ?? "").toUpperCase();
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.map(String) : body?.messageId ? [String(body.messageId)] : [];
  if (!ids.length) return json(200, { ok: true, ignorado: true });
  const agora = new Date().toISOString();

  if (status === "RECEIVED" || status === "DELIVERED") {
    await admin.from("dp_whatsapp_envios").update({ status: "entregue", entregue_em: agora })
      .in("message_id", ids).eq("status", "enviado");
  } else if (status === "READ" || status === "PLAYED") {
    await admin.from("dp_whatsapp_envios").update({ status: "lido", lido_em: agora })
      .in("message_id", ids).in("status", ["enviado", "entregue"]);
    await admin.from("dp_whatsapp_envios").update({ entregue_em: agora })
      .in("message_id", ids).is("entregue_em", null);
  }
  return json(200, { ok: true });
});
