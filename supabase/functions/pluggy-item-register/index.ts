// Fast-path chamado pelo onSuccess do widget. Não é fonte de verdade — se o
// callback não rodar, o webhook materializa a mesma conexão pelo mesmo helper.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "https://esm.sh/zod@3.23.8";
import { materializePluggyItem } from "../_shared/materialize-pluggy-item.ts";

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

  const result = await materializePluggyItem({
    supabase,
    itemId: body.item_id,
    requestId: body.request_id ?? null,
    connectedByUserId: userId,
    trigger: "item_register",
    expectedCompanyId: body.company_id,
  });

  if (!result.ok) {
    const status = result.transient ? 502 : 400;
    return json(status, { error: result.errorCode, detail: result.detail });
  }

  return json(200, {
    connection_id: result.connectionId,
    accounts_found: result.accountsFound,
    accounts_upserted: result.accountsUpserted,
    status: result.itemStatus,
    sync_run_id: result.syncRunId,
    already_materialized: result.alreadyMaterialized,
  });
});
