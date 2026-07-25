// Emits a short-lived Pluggy connect token for the widget.
// Requires: authenticated user + company_id where user is admin/owner or has finance permission.
// Body: { company_id: uuid, item_id?: string }  (item_id for reconnect flow)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "https://esm.sh/zod@3.23.8";
import { createConnectToken, safePluggyError } from "../_shared/pluggy-client.ts";

const BodySchema = z.object({
  company_id: z.string().uuid(),
  item_id: z.string().min(1).max(128).optional(),
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
  const { data: userData, error: userErr } = await supabaseUser.auth.getUser();
  if (userErr || !userData?.user) return json(401, { error: "unauthenticated" });
  const userId = userData.user.id;

  let parsed;
  try {
    parsed = BodySchema.parse(await req.json());
  } catch {
    return json(400, { error: "invalid_body" });
  }

  const supabase = createClient(url, service);

  // Authorize: must be admin/owner of the company
  const { data: allowed, error: roleErr } = await supabase.rpc("is_company_admin_or_owner", {
    _user_id: userId,
    _company_id: parsed.company_id,
  });
  if (roleErr || !allowed) return json(403, { error: "forbidden" });

  const webhookBase = Deno.env.get("SUPABASE_URL")!.replace(".supabase.co", ".functions.supabase.co");
  const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/pluggy-webhook`;

  const result = await createConnectToken({
    clientUserId: `${parsed.company_id}:${userId}`,
    webhookUrl,
    itemId: parsed.item_id,
  });

  if (!result.ok) {
    return json(502, { error: safePluggyError(result.error, result.httpStatus) });
  }

  // Track the connection request row (status: pending)
  const { data: requestRow } = await supabase
    .from("open_finance_connection_requests")
    .insert({
      company_id: parsed.company_id,
      user_id: userId,
      status: "pending",
      connect_token: result.data.accessToken.slice(0, 32) + "…", // truncated for audit only
      item_id: parsed.item_id ?? null,
    })
    .select("id")
    .maybeSingle();

  return json(200, {
    access_token: result.data.accessToken,
    request_id: requestRow?.id ?? null,
  });
});
