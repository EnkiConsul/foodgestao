import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

/**
 * Cron-only endpoint. Auth model:
 *  - verify_jwt = false (see supabase/config.toml)
 *  - Caller MUST present either:
 *      Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>   (service role JWT), OR
 *      x-cron-secret: <EXPIRE_TRIALS_SECRET>               (shared secret used by scheduler)
 *  - Any other caller (including anon/authenticated JWTs) is rejected with 403.
 */
function parseJwtRole(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    );
    return typeof json?.role === "string" ? json.role : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // --- Authorization gate ----------------------------------------------------
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const expectedSecret = Deno.env.get("EXPIRE_TRIALS_SECRET") ?? "";

  const authHeader = req.headers.get("Authorization") ?? "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const cronSecret = req.headers.get("x-cron-secret") ?? "";

  const isServiceRoleJwt =
    bearer.length > 0 &&
    (bearer === serviceRoleKey || parseJwtRole(bearer) === "service_role");
  const isCronSecret =
    expectedSecret.length > 0 && cronSecret === expectedSecret;

  if (!isServiceRoleJwt && !isCronSecret) {
    return new Response(
      JSON.stringify({ ok: false, error: "Forbidden" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      },
    );
  }

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceRoleKey);

    const { data, error } = await supabase
      .from("subscriptions")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("status", "trialing")
      .lt("trial_ends_at", new Date().toISOString())
      .select("id, user_id");

    if (error) throw error;

    // Expire time-limited exemptions
    const { data: exp, error: expErr } = await supabase
      .from("subscriptions")
      .update({
        is_exempt: false,
        exempt_until: null,
        status: "past_due",
        updated_at: new Date().toISOString(),
      })
      .eq("is_exempt", true)
      .not("exempt_until", "is", null)
      .lt("exempt_until", new Date().toISOString())
      .select("id");
    if (expErr) throw expErr;


    return new Response(
      JSON.stringify({ ok: true, expired_count: data?.length ?? 0, exemptions_expired: exp?.length ?? 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );

  } catch (err) {
    console.error("[expire-trials] error", err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
