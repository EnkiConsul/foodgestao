import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

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
