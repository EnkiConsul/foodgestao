// pluggy-item-delete
// Disconnects an Open Finance connection: removes the item at Pluggy and
// soft-deletes the local row (is_active=false, disconnected_at=now).
//
// Transactions previously ingested from this connection are preserved by
// design — the "anti-ressurreição" flag on transactions.of_deleted lives
// elsewhere; deleting the connection here does not delete history.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { deleteItem, PluggyError } from "../_shared/pluggy.ts";

const BodySchema = z.object({
  connection_id: z.string().uuid(),
});

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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
    const { connection_id } = parsed.data;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: conn, error: connErr } = await admin
      .from("open_finance_connections")
      .select("id, company_id, provider_item_id, is_active")
      .eq("id", connection_id)
      .maybeSingle();
    if (connErr) return json({ error: "connection_lookup_failed" }, 500);
    if (!conn) return json({ error: "connection_not_found" }, 404);

    const { data: isAdmin, error: adminErr } = await admin.rpc("is_company_admin_or_owner", {
      _user_id: userId,
      _company_id: conn.company_id,
    });
    if (adminErr) return json({ error: "authorization_check_failed" }, 500);
    if (!isAdmin) return json({ error: "forbidden_company_role" }, 403);

    // Best-effort delete at Pluggy. If the item is already gone (404) we
    // still proceed to mark the local row disconnected — the goal is to
    // reach a consistent "disconnected" state.
    let providerDeleted = true;
    try {
      await deleteItem(conn.provider_item_id);
    } catch (err) {
      if (err instanceof PluggyError && err.status === 404) {
        providerDeleted = true;
      } else if (err instanceof PluggyError) {
        console.error("[pluggy-item-delete] pluggy_error", { code: err.code, status: err.status });
        return json({ error: "pluggy_error", code: err.code }, err.status >= 500 ? 502 : 400);
      } else {
        console.error("[pluggy-item-delete] unexpected", err);
        return json({ error: "unexpected_error" }, 500);
      }
    }

    const nowIso = new Date().toISOString();
    const { error: upErr } = await admin
      .from("open_finance_connections")
      .update({
        is_active: false,
        disconnected_at: nowIso,
        item_status: "DELETED",
        execution_status: null,
        updated_at: nowIso,
      })
      .eq("id", conn.id);
    if (upErr) return json({ error: "connection_update_failed" }, 500);

    return json({ ok: true, provider_deleted: providerDeleted });
  } catch (e) {
    console.error("[pluggy-item-delete] fatal", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
