// supabase/functions/asaas-cancel-subscription/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { asaasFetch } from "../_shared/asaas.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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
    const body = await req.json().catch(() => ({}));
    const subscriptionId: string | undefined = body.subscriptionId;
    if (!subscriptionId) return json({ error: "subscriptionId required" }, 400);

    const { data: sub } = await admin.from("subscriptions").select("*")
      .eq("id", subscriptionId).maybeSingle();
    if (!sub || sub.user_id !== u.user.id) return json({ error: "Not found" }, 404);

    if (sub.external_subscription_id) {
      await asaasFetch(`/subscriptions/${sub.external_subscription_id}`, { method: "DELETE" })
        .catch((e) => console.warn("Asaas delete failed:", e.message));
    }

    await admin.from("subscriptions").update({
      status: "canceled", canceled_at: new Date().toISOString(),
    }).eq("id", sub.id);

    return json({ ok: true });
  } catch (e) {
    console.error("cancel error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
