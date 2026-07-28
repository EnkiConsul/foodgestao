// P0 — Wrapper HTTP fino do helper compartilhado.
// Contrato de entrada preservado; toda a lógica agora está em
// _shared/materialize-pluggy-item.ts para convergir webhook + fast-path.
//
// verify_jwt = false. Aceita:
//   - Bearer service-role (webhook interno / cron / drain)
//   - Bearer JWT de admin/owner da company_id passada (fast-path do widget)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "https://esm.sh/zod@3.23.8";
import {
  materializePluggyItem,
  type MaterializeTrigger,
} from "../_shared/materialize-pluggy-item.ts";

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
  let connectedByUserId: string | null = null;

  if (!isServiceRole) {
    const supabaseUser = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims, error: claimsErr } = await supabaseUser.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) return json(401, { error: "unauthenticated" });
    if (!body.company_id) return json(400, { error: "company_id_required" });
    const { data: allowed } = await supabase.rpc("is_company_admin_or_owner", {
      _user_id: claims.claims.sub,
      _company_id: body.company_id,
    });
    if (!allowed) return json(403, { error: "forbidden" });
    connectedByUserId = claims.claims.sub as string;
  }

  const trigger: MaterializeTrigger =
    (body.triggered_by as MaterializeTrigger) ?? "materialize";

  const result = await materializePluggyItem({
    supabase,
    itemId: body.item_id,
    requestId: body.request_id ?? null,
    clientUserId: body.client_user_id ?? null,
    connectedByUserId,
    trigger,
    expectedCompanyId: body.company_id ?? null,
  });

  if (!result.ok) {
    const status = result.transient ? 502 : 400;
    return json(status, { error: result.errorCode, detail: result.detail });
  }

  return json(200, {
    connection_id: result.connectionId,
    company_id: result.companyId,
    request_id: result.requestId,
    item_id: result.itemId,
    status: result.itemStatus,
    accounts_found: result.accountsFound,
    accounts_upserted: result.accountsUpserted,
    sync_run_id: result.syncRunId,
    created: result.created,
    already_materialized: result.alreadyMaterialized,
  });
});
