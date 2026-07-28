// Bloco 1 (P0-1) — Materialização server-side de uma conexão Open Finance.
//
// Chamado por:
//   a) callback do widget no cliente (fluxo feliz) — mantém a UX atual;
//   b) webhook item/created e item/updated — garante materialização mesmo se o
//      callback do navegador não rodar (rede caiu, aba fechada, background).
//
// Idempotente por (company_id, pluggy_item_id). Se a conexão já existir, apenas
// atualiza status/contas. Se não houver `company_id` no body, tentamos derivar
// via `clientUserId = ofreq:<request_id>` -> open_finance_connection_requests.
//
// verify_jwt = false (chamado por webhook e por callback com service context).
// Rejeita chamadas sem um dos dois:
//   - Bearer service-role (webhook interno / cron)
//   - Bearer JWT válido de admin/owner da company_id passada
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "https://esm.sh/zod@3.23.8";
import { getItem, listAccounts, safePluggyError } from "../_shared/pluggy-client.ts";

const BodySchema = z.object({
  item_id: z.string().min(1).max(128),
  company_id: z.string().uuid().optional(),
  request_id: z.string().uuid().optional(),
  client_user_id: z.string().max(256).optional(),
  triggered_by: z.string().max(64).optional(),
});

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json(401, { error: "unauthenticated" });
  const token = authHeader.substring("Bearer ".length);

  let body;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return json(400, { error: "invalid_body" });
  }

  const supabase = createClient(url, service);
  const isServiceRole = token === service;

  // Se veio JWT de usuário (não service-role), exige company_id + admin/owner.
  if (!isServiceRole) {
    const supabaseUser = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await supabaseUser.auth.getUser();
    if (!userData?.user) return json(401, { error: "unauthenticated" });
    if (!body.company_id) return json(400, { error: "company_id_required" });
    const { data: allowed } = await supabase.rpc("is_company_admin_or_owner", {
      _user_id: userData.user.id,
      _company_id: body.company_id,
    });
    if (!allowed) return json(403, { error: "forbidden" });
  }

  // Resolve company_id se não veio no body (fluxo webhook).
  let companyId = body.company_id ?? null;
  let requestId = body.request_id ?? null;
  let requestedByUserId: string | null = null;

  if (!companyId || !requestId) {
    // 1. Tenta pelo request_id ou pelo clientUserId (ofreq:<uuid>)
    let reqQuery = supabase
      .from("open_finance_connection_requests")
      .select("id, company_id, requested_by_user_id")
      .order("created_at", { ascending: false })
      .limit(1);
    if (requestId) {
      reqQuery = reqQuery.eq("id", requestId);
    } else if (body.client_user_id?.startsWith("ofreq:")) {
      reqQuery = reqQuery.eq("id", body.client_user_id.substring("ofreq:".length));
    } else if (body.client_user_id) {
      // fallback improvável: match direto pela metadata
      reqQuery = reqQuery.eq("pluggy_item_id", body.item_id);
    } else {
      reqQuery = reqQuery.eq("pluggy_item_id", body.item_id);
    }
    const { data: reqRow } = await reqQuery.maybeSingle();
    if (reqRow) {
      companyId = reqRow.company_id as string;
      requestId = reqRow.id as string;
      requestedByUserId = reqRow.requested_by_user_id as string;
    }
  }

  // 2. Fallback: talvez a conexão já exista (webhook update).
  if (!companyId) {
    const { data: existing } = await supabase
      .from("open_finance_connections")
      .select("id, company_id, connected_by_user_id")
      .eq("pluggy_item_id", body.item_id)
      .maybeSingle();
    if (existing) {
      companyId = existing.company_id as string;
      requestedByUserId = existing.connected_by_user_id as string;
    }
  }

  if (!companyId) {
    // Não conseguimos amarrar o item a nenhum tenant — guardamos para retry manual.
    console.warn("[pluggy-item-materialize] no tenant match for item", body.item_id);
    return json(202, { deferred: true, reason: "no_tenant_match" });
  }

  // 3. Busca o item na Pluggy.
  const itemResp = await getItem(body.item_id);
  if (!itemResp.ok) {
    return json(502, { error: safePluggyError(itemResp.error, itemResp.httpStatus) });
  }
  const item = itemResp.data as any;

  // 4. Upsert da conexão. Idempotente por (company_id, pluggy_item_id).
  const { data: conn, error: connErr } = await supabase
    .from("open_finance_connections")
    .upsert(
      {
        company_id: companyId,
        connected_by_user_id: requestedByUserId ?? item.clientUserId ?? "00000000-0000-0000-0000-000000000000",
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
    console.error("[pluggy-item-materialize] upsert connection failed:", connErr?.message);
    return json(500, { error: "connection_upsert_failed" });
  }

  // 5. Upsert das contas.
  const accResp = await listAccounts(item.id);
  let accountsFound = 0;
  if (accResp.ok) {
    const rows = (accResp.data.results ?? []).map((a) => ({
      connection_id: conn.id,
      company_id: companyId!,
      pluggy_account_id: a.id,
      type: a.type,
      subtype: a.subtype ?? null,
      name: a.name ?? a.marketingName ?? null,
      number: a.number ?? null,
      balance: a.balance ?? null,
      currency: a.currencyCode ?? "BRL",
      raw: a as any,
    }));
    accountsFound = rows.length;
    if (rows.length) {
      const { error: accErr } = await supabase
        .from("open_finance_accounts")
        .upsert(rows, { onConflict: "connection_id,pluggy_account_id" });
      if (accErr) console.error("[pluggy-item-materialize] upsert accounts failed:", accErr.message);
    }
  }

  // 6. Atualiza request (se houver) e enfileira sync inicial.
  if (requestId) {
    await supabase
      .from("open_finance_connection_requests")
      .update({
        status: "connected",
        pluggy_item_id: item.id,
        completed_at: new Date().toISOString(),
      })
      .eq("id", requestId);
  }

  await supabase.from("open_finance_sync_runs").insert({
    connection_id: conn.id,
    company_id: companyId,
    status: "queued",
    triggered_by: body.triggered_by ?? "materialize",
  });

  return json(200, {
    connection_id: conn.id,
    accounts_found: accountsFound,
    status: item.status,
  });
});
