import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";

const BodySchema = z.object({ subscriptionId: z.string().uuid() });

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const auth = req.headers.get("Authorization") ?? "";

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u.user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: isSuper } = await admin.rpc("is_super_admin", { _user_id: u.user.id });
    if (!isSuper) return json({ error: "Forbidden" }, 403);

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
    const { subscriptionId } = parsed.data;

    const { data: sub } = await admin
      .from("subscriptions").select("user_id, is_exempt").eq("id", subscriptionId).maybeSingle();
    if (!sub) return json({ error: "Not found" }, 404);

    const { error: updErr } = await admin.from("subscriptions").update({
      is_exempt: false,
      exempt_until: null,
      exempt_reason: null,
      exempted_by: null,
      exempted_at: null,
      status: "active",
    }).eq("id", subscriptionId);
    if (updErr) return json({ error: updErr.message }, 500);

    await admin.from("audit_logs").insert({
      user_id: u.user.id,
      action: "subscription_exemption_removed",
      entity_type: "subscription",
      entity_id: subscriptionId,
      details: { target_user_id: sub.user_id },
    });

    return json({ ok: true });
  } catch (e) {
    console.error("[admin-remove-exemption] error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
