// Called by the frontend right after the Pluggy widget succeeds.
// Persists the item as an open_finance_connection, fetches accounts, upserts open_finance_accounts,
// and enqueues an initial sync run.
// Body: { company_id: uuid, item_id: string, request_id?: uuid }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "https://esm.sh/zod@3.23.8";
import { getItem, listAccounts, safePluggyError } from "../_shared/pluggy-client.ts";

const BodySchema = z.object({
  company_id: z.string().uuid(),
  item_id: z.string().min(1).max(128),
  request_id: z.string().uuid().optional(),
});

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json(401, { error: "unauthenticated" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabaseUser = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsErr } = await supabaseUser.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims?.sub) return json(401, { error: "unauthenticated" });
  const userId = claimsData.claims.sub as string;

  let body;
  try { body = BodySchema.parse(await req.json()); }
  catch { return json(400, { error: "invalid_body" }); }

  const supabase = createClient(url, service);

  const { data: allowed } = await supabase.rpc("is_company_admin_or_owner", {
    _user_id: userId,
    _company_id: body.company_id,
  });
  if (!allowed) return json(403, { error: "forbidden" });

  const itemResp = await getItem(body.item_id);
  if (!itemResp.ok) return json(502, { error: safePluggyError(itemResp.error, itemResp.httpStatus) });
  const item = itemResp.data;

  // Upsert connection
  const { data: conn, error: connErr } = await supabase
    .from("open_finance_connections")
    .upsert(
      {
        company_id: body.company_id,
        connected_by_user_id: userId,
        pluggy_item_id: item.id,
        institution_name: item.connector?.name ?? null,
        institution_logo_url: item.connector?.imageUrl ?? null,
        connector_id: item.connector?.id ?? null,
        status: item.status ?? "UPDATED",
        status_detail: item.executionStatus ?? null,
        consent_expires_at: item.consentExpiresAt ?? null,
      },
      { onConflict: "company_id,pluggy_item_id" },
    )
    .select("id")
    .maybeSingle();

  if (connErr || !conn) {
    console.error("[pluggy-item-register] upsert connection failed:", connErr);
    return json(500, { error: "connection_upsert_failed" });
  }

  const accResp = await listAccounts(item.id);
  if (!accResp.ok) return json(502, { error: safePluggyError(accResp.error, accResp.httpStatus) });

  const rows = (accResp.data.results ?? []).map((a) => ({
    connection_id: conn.id,
    company_id: body.company_id,
    pluggy_account_id: a.id,
    type: a.type,
    subtype: a.subtype ?? null,
    name: a.name ?? a.marketingName ?? null,
    number: a.number ?? null,
    balance: a.balance ?? null,
    currency: a.currencyCode ?? "BRL",
    raw: a as any,
  }));

  if (rows.length) {
    const { error: accErr } = await supabase
      .from("open_finance_accounts")
      .upsert(rows, { onConflict: "connection_id,pluggy_account_id" });
    if (accErr) {
      console.error("[pluggy-item-register] upsert accounts failed:", accErr);
    }
  }

  // Enqueue initial sync
  await supabase.from("open_finance_sync_runs").insert({
    connection_id: conn.id,
    company_id: body.company_id,
    status: "queued",
    triggered_by: "item_register",
  });

  if (body.request_id) {
    await supabase
      .from("open_finance_connection_requests")
      .update({ status: "connected", pluggy_item_id: item.id })
      .eq("id", body.request_id);
  }

  return json(200, {
    connection_id: conn.id,
    accounts_found: rows.length,
    status: item.status,
  });
});
