// pluggy-delete-connection: remove item na Pluggy e apaga conexão local
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PLUGGY_BASE = "https://api.pluggy.ai";

async function pluggyAuth(): Promise<string> {
  const res = await fetch(`${PLUGGY_BASE}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId: Deno.env.get("PLUGGY_CLIENT_ID"),
      clientSecret: Deno.env.get("PLUGGY_CLIENT_SECRET"),
    }),
  });
  if (!res.ok) throw new Error(`Pluggy auth failed: ${res.status}`);
  return (await res.json()).apiKey as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: cErr } = await supabase.auth.getClaims(token);
    if (cErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { connection_id } = await req.json();

    // Enforce that only the connection owner or a company admin/owner can delete.
    const { data: allowed, error: permErr } = await supabase.rpc("can_manage_bank_connection", { _connection_id: connection_id });
    if (permErr || allowed !== true) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: conn } = await admin
      .from("bank_connections").select("*").eq("id", connection_id).maybeSingle();
    if (!conn) {
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }


    try {
      const apiKey = await pluggyAuth();
      await fetch(`${PLUGGY_BASE}/items/${conn.provider_item_id}`, {
        method: "DELETE",
        headers: { "X-API-KEY": apiKey },
      });
    } catch (e) {
      console.warn("[pluggy delete item warning]", e);
    }

    await admin.from("bank_connection_accounts").delete().eq("connection_id", connection_id);
    await admin.from("bank_connections").delete().eq("id", connection_id);


    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[pluggy-delete-connection]", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
