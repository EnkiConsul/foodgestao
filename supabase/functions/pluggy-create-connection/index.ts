// pluggy-create-connection: recebe itemId do widget, cria bank_connection + bank_connection_accounts
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

async function pluggyGet(apiKey: string, path: string) {
  const res = await fetch(`${PLUGGY_BASE}${path}`, { headers: { "X-API-KEY": apiKey } });
  if (!res.ok) throw new Error(`Pluggy GET ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
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
    const userId = claims.claims.sub as string;

    const { itemId, context, company_id } = await req.json();
    if (!itemId || !context || (context === "pj" && !company_id)) {
      return new Response(JSON.stringify({ error: "itemId, context e company_id (se PJ) são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = await pluggyAuth();
    const item = await pluggyGet(apiKey, `/items/${itemId}`);
    const accountsRes = await pluggyGet(apiKey, `/accounts?itemId=${itemId}`);
    const accounts = accountsRes.results ?? [];

    // Upsert connection
    const { data: conn, error: connErr } = await supabase
      .from("bank_connections")
      .upsert({
        user_id: userId,
        company_id: context === "pj" ? company_id : null,
        context,
        provider: "pluggy",
        provider_item_id: itemId,
        institution_name: item.connector?.name ?? null,
        institution_logo_url: item.connector?.imageUrl ?? null,
        status: item.status === "UPDATED" ? "active" : (item.status?.toLowerCase() ?? "active"),
        consent_expires_at: item.consentExpiresAt ?? null,
        last_sync_at: item.lastUpdatedAt ?? null,
      }, { onConflict: "provider_item_id" })
      .select()
      .single();
    if (connErr) throw connErr;

    // Upsert descoberto accounts
    for (const a of accounts) {
      await supabase.from("bank_connection_accounts").upsert({
        connection_id: conn.id,
        provider_account_id: a.id,
        provider_type: a.type ?? null,
        provider_subtype: a.subtype ?? null,
        provider_name: a.name ?? null,
        provider_number: a.number ?? null,
        currency_code: a.currencyCode ?? "BRL",
        provider_balance: a.balance ?? null,
      }, { onConflict: "connection_id,provider_account_id" });
    }

    const { data: discovered } = await supabase
      .from("bank_connection_accounts")
      .select("*")
      .eq("connection_id", conn.id);

    return new Response(JSON.stringify({ connection: conn, discovered_accounts: discovered ?? [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[pluggy-create-connection]", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
