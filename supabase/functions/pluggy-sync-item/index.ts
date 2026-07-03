// pluggy-sync-item: sincroniza transações de uma bank_connection específica
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

export async function syncConnection(admin: any, connectionId: string, apiKey?: string) {
  const key = apiKey ?? await pluggyAuth();
  const { data: conn, error: cErr } = await admin
    .from("bank_connections").select("*").eq("id", connectionId).single();
  if (cErr || !conn) throw cErr ?? new Error("Connection not found");

  const { data: cAccounts } = await admin
    .from("bank_connection_accounts")
    .select("*")
    .eq("connection_id", conn.id)
    .not("account_id", "is", null)
    .eq("auto_import", true);

  const fromDate = new Date(Date.now() - 1000 * 60 * 60 * 24 * (conn.last_sync_at ? 3 : 90))
    .toISOString().slice(0, 10);
  let inserted = 0, updated = 0;

  try {
    for (const ca of cAccounts ?? []) {
      let page = 1;
      while (true) {
        const res = await pluggyGet(key, `/transactions?accountId=${ca.provider_account_id}&from=${fromDate}&page=${page}&pageSize=500`);
        const items = res.results ?? [];
        for (const tx of items) {
          const amountAbs = Math.abs(tx.amount);
          const isReceita = tx.amount > 0;
          const txDate = (tx.date ?? tx.postDate ?? new Date().toISOString()).slice(0, 10);
          const record = {
            user_id: conn.user_id,
            context: conn.context,
            company_id: conn.company_id,
            account_id: ca.account_id,
            description: tx.description ?? tx.descriptionRaw ?? "Sem descrição",
            amount: amountAbs,
            amount_paid: amountAbs,
            transaction_type: isReceita ? "receita" : "despesa",
            transaction_date: txDate,
            payment_date: txDate,
            status: "confirmado" as const,
            is_confirmed: true,
            provider: "pluggy",
            external_id: tx.id,
            connection_id: conn.id,
          };
          const { data: existing } = await admin
            .from("transactions")
            .select("id")
            .eq("provider", "pluggy")
            .eq("external_id", tx.id)
            .maybeSingle();
          if (existing) {
            await admin.from("transactions").update({
              amount: record.amount, amount_paid: record.amount_paid,
              description: record.description, transaction_date: record.transaction_date,
              payment_date: record.payment_date,
            }).eq("id", existing.id);
            updated++;
          } else {
            const { error: iErr } = await admin.from("transactions").insert(record);
            if (!iErr) inserted++;
            else console.error("[insert tx]", iErr, record);
          }
        }
        if (items.length < 500) break;
        page++;
        if (page > 20) break; // safety
      }
    }

    await admin.from("bank_connections").update({
      last_sync_at: new Date().toISOString(),
      last_error: null,
      status: "active",
    }).eq("id", conn.id);
  } catch (e) {
    await admin.from("bank_connections").update({
      last_error: (e as Error).message,
      status: "login_error",
    }).eq("id", conn.id);
    throw e;
  }

  return { inserted, updated, accounts: cAccounts?.length ?? 0 };
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
    if (!connection_id) {
      return new Response(JSON.stringify({ error: "connection_id obrigatório" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Require the caller to have edit permission on the transactions module of the
    // connection's company (or be the PF owner). SELECT-level company membership
    // alone is not enough — sync mutates transactions on behalf of the company.
    const { data: allowed, error: permErr } = await supabase.rpc("can_sync_bank_connection", { _connection_id: connection_id });
    if (permErr || allowed !== true) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }


    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const result = await syncConnection(admin, connection_id);

    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[pluggy-sync-item]", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
