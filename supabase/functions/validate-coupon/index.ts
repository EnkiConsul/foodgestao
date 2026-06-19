import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BodySchema = z.object({
  code: z.string().trim().min(1).max(64),
  planId: z.string().uuid().optional(),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
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

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: "Invalid input" }, 400);
    const code = parsed.data.code.toUpperCase();
    const planId = parsed.data.planId;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: c } = await admin
      .from("coupons")
      .select("id, code, discount_type, discount_value, valid_until, max_redemptions, times_redeemed, applicable_plan_ids, is_active")
      .eq("code", code)
      .eq("is_active", true)
      .maybeSingle();

    if (!c) return json({ valid: false, reason: "not_found" }, 200);
    if (c.valid_until && new Date(c.valid_until) < new Date())
      return json({ valid: false, reason: "expired" }, 200);
    if (c.max_redemptions && c.times_redeemed >= c.max_redemptions)
      return json({ valid: false, reason: "exhausted" }, 200);
    if (
      planId &&
      Array.isArray(c.applicable_plan_ids) &&
      c.applicable_plan_ids.length > 0 &&
      !c.applicable_plan_ids.includes(planId)
    ) {
      return json({ valid: false, reason: "plan_not_eligible" }, 200);
    }

    return json({
      valid: true,
      coupon: {
        code: c.code,
        discount_type: c.discount_type,
        discount_value: c.discount_value,
      },
    });
  } catch (e) {
    console.error("[validate-coupon]", e);
    return json({ error: "Internal" }, 500);
  }
});
