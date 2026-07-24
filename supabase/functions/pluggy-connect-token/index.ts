// pluggy-connect-token
// Creates a Pluggy connect token for the Widget. Two modes:
//   - mode=create:       new item for company_id (user must be admin/owner)
//   - mode=update:       reconnect an existing open_finance_connections row
//                        (requires connection_id; passes item_id to Pluggy)
//   - mode=renew_consent: same as update, but tags the request accordingly
//
// Persists an open_finance_connection_requests row so the webhook worker
// (Bloco 4) can correlate the returned itemId back to the requesting user.
//
// Never logs Client-Id, Client-Secret, apiKey nor the returned accessToken.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { createConnectToken, PluggyError } from "../_shared/pluggy.ts";

const BodySchema = z.object({
  company_id: z.string().uuid(),
  mode: z.enum(["create", "update", "renew_consent"]).default("create"),
  connection_id: z.string().uuid().optional(),
});

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const REQUEST_TTL_MINUTES = 30;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (claimsErr || !claims?.claims?.sub) return json({ error: "unauthorized" }, 401);
    const userId = claims.claims.sub as string;

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return json({ error: "validation_failed", details: parsed.error.flatten() }, 400);
    }
    const { company_id, mode } = parsed.data;
    let { connection_id } = parsed.data;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Only admins/owners of the company may open a bank connection flow.
    const { data: isAdmin, error: adminErr } = await admin.rpc("is_company_admin_or_owner", {
      _user_id: userId,
      _company_id: company_id,
    });
    if (adminErr) return json({ error: "authorization_check_failed" }, 500);
    if (!isAdmin) return json({ error: "forbidden_company_role" }, 403);

    // For update/renew we need an existing pluggy item id.
    let providerItemId: string | undefined;
    if (mode !== "create") {
      if (!connection_id) return json({ error: "connection_id_required_for_update" }, 400);

      const { data: conn, error: connErr } = await admin
        .from("open_finance_connections")
        .select("id, company_id, provider_item_id, is_active")
        .eq("id", connection_id)
        .maybeSingle();
      if (connErr) return json({ error: "connection_lookup_failed" }, 500);
      if (!conn || conn.company_id !== company_id) return json({ error: "connection_not_found" }, 404);
      providerItemId = conn.provider_item_id;
    }

    // Persist the request row *before* calling Pluggy so we can correlate
    // failures and expiry later.
    const now = new Date();
    const expiresAt = new Date(now.getTime() + REQUEST_TTL_MINUTES * 60 * 1000);
    const { data: reqRow, error: reqErr } = await admin
      .from("open_finance_connection_requests")
      .insert({
        company_id,
        requested_by: userId,
        provider: "pluggy",
        mode,
        existing_connection_id: connection_id ?? null,
        status: "pending",
        expires_at: expiresAt.toISOString(),
      })
      .select("id")
      .single();
    if (reqErr || !reqRow) return json({ error: "request_persist_failed" }, 500);

    try {
      const { accessToken } = await createConnectToken({
        itemId: providerItemId,
        clientUserId: `company:${company_id}`,
      });

      await admin
        .from("open_finance_connection_requests")
        .update({ status: "token_created" })
        .eq("id", reqRow.id);

      return json({
        ok: true,
        request_id: reqRow.id,
        access_token: accessToken,
        expires_at: expiresAt.toISOString(),
      });
    } catch (err) {
      await admin
        .from("open_finance_connection_requests")
        .update({ status: "failed" })
        .eq("id", reqRow.id);

      if (err instanceof PluggyError) {
        console.error("[pluggy-connect-token] pluggy_error", { code: err.code, status: err.status });
        return json({ error: "pluggy_error", code: err.code }, err.status >= 500 ? 502 : 400);
      }
      console.error("[pluggy-connect-token] unexpected", err);
      return json({ error: "unexpected_error" }, 500);
    }
  } catch (e) {
    console.error("[pluggy-connect-token] fatal", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
