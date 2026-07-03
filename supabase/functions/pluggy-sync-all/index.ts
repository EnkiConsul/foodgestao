// pluggy-sync-all: percorre todas as conexões ativas e sincroniza (chamado por cron)
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };
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
  if (!res.ok) throw new Error(`Pluggy GET ${path} failed: ${res.status}`);
  return res.json();
}

async function syncOne(admin: any, apiKey: string, conn: any) {
  const { data: cAccounts } = await admin
    .from("bank_connection_accounts").select("*")
    .eq("connection_id", conn.id).not("account_id", "is", null).eq("auto_import", true);

  const fromDate = new Date(Date.now() - 1000 * 60 * 60 * 24 * (conn.last_sync_at ? 3 : 90))
    .toISOString().slice(0, 10);
  let inserted = 0, updated = 0;

  for (const ca of cAccounts ?? []) {
    let page = 1;
    while (true) {
      const res = await pluggyGet(apiKey, `/transactions?accountId=${ca.provider_account_id}&from=${fromDate}&page=${page}&pageSize=500`);
      const items = res.results ?? [];
      for (const tx of items) {
        const amountAbs = Math.abs(tx.amount);
        const isReceita = tx.amount > 0;
        const txDate = (tx.date ?? tx.postDate ?? new Date().toISOString()).slice(0, 10);
        const { data: existing } = await admin
          .from("transactions").select("id").eq("provider", "pluggy").eq("external_id", tx.id).maybeSingle();
        const record = {
          user_id: conn.user_id, context: conn.context, company_id: conn.company_id,
          account_id: ca.account_id,
          description: tx.description ?? tx.descriptionRaw ?? "Sem descrição",
          amount: amountAbs, amount_paid: amountAbs,
          transaction_type: isReceita ? "receita" : "despesa",
          transaction_date: txDate, payment_date: txDate,
          status: "confirmado", is_confirmed: true,
          provider: "pluggy", external_id: tx.id, connection_id: conn.id,
        };
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
        }
      }
      if (items.length < 500) break;
      page++;
      if (page > 20) break;
    }
  }
  return { inserted, updated };
}

function parseJwtRole(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json?.role === "string" ? json.role : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // --- Authorization gate (cron-only endpoint) ---
  // Accept either a service-role JWT (Authorization: Bearer ...) or the shared
  // cron secret (x-cron-secret). All other callers get 403.
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const expectedSecret = Deno.env.get("PLUGGY_SYNC_ALL_SECRET") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const cronSecret = req.headers.get("x-cron-secret") ?? "";
  const isServiceRoleJwt =
    bearer.length > 0 &&
    (bearer === serviceRoleKey || parseJwtRole(bearer) === "service_role");
  const isCronSecret = expectedSecret.length > 0 && cronSecret === expectedSecret;
  if (!isServiceRoleJwt && !isCronSecret) {
    return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: conns } = await admin
      .from("bank_connections").select("*")
      .in("status", ["active", "updating", "outdated"]);

    const apiKey = await pluggyAuth();
    const results: any[] = [];
    for (const conn of conns ?? []) {
      try {
        const r = await syncOne(admin, apiKey, conn);
        await admin.from("bank_connections").update({
          last_sync_at: new Date().toISOString(), last_error: null, status: "active",
        }).eq("id", conn.id);
        results.push({ id: conn.id, ...r });
      } catch (e) {
        await admin.from("bank_connections").update({
          last_error: (e as Error).message, status: "login_error",
        }).eq("id", conn.id);
        results.push({ id: conn.id, error: (e as Error).message });
      }
    }
    return new Response(JSON.stringify({ ok: true, count: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[pluggy-sync-all]", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
