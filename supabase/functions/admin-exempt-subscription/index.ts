import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { asaasFetch } from "../_shared/asaas.ts";

const BodySchema = z.object({
  subscriptionId: z.string().uuid(),
  planId: z.string().uuid(),
  mode: z.enum(["permanent", "until"]),
  exemptUntil: z.string().datetime().optional().nullable(),
  reason: z.string().max(500).optional().nullable(),
});

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
    const { subscriptionId, planId, mode, exemptUntil, reason } = parsed.data;

    if (mode === "until") {
      if (!exemptUntil) return json({ error: "exemptUntil required" }, 400);
      if (new Date(exemptUntil) <= new Date()) {
        return json({ error: "exemptUntil must be in the future" }, 400);
      }
    }

    const { data: sub, error: subErr } = await admin
      .from("subscriptions").select("*").eq("id", subscriptionId).maybeSingle();
    if (subErr || !sub) return json({ error: "Subscription not found" }, 404);

    // Cancel on Asaas if exists
    if (sub.external_subscription_id) {
      try {
        await asaasFetch(`/subscriptions/${sub.external_subscription_id}`, { method: "DELETE" });
      } catch (e) {
        console.warn("[admin-exempt] Asaas cancel failed:", (e as Error).message);
      }
    }

    const exempt_until = mode === "until" ? exemptUntil : null;

    const { error: updErr } = await admin.from("subscriptions").update({
      is_exempt: true,
      exempt_until,
      exempt_reason: reason ?? null,
      exempted_by: u.user.id,
      exempted_at: new Date().toISOString(),
      plan_id: planId,
      status: "active",
      external_subscription_id: null,
      canceled_at: null,
    }).eq("id", subscriptionId);
    if (updErr) return json({ error: updErr.message }, 500);

    await admin.from("audit_logs").insert({
      user_id: u.user.id,
      action: "subscription_exempted",
      entity_type: "subscription",
      entity_id: subscriptionId,
      details: { target_user_id: sub.user_id, plan_id: planId, mode, exempt_until, reason: reason ?? null },
    });

    return json({ ok: true });
  } catch (e) {
    console.error("[admin-exempt] error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
