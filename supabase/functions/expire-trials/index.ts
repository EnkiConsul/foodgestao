import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

/**
 * Cron-only endpoint. Auth model:
 *  - verify_jwt = false (see supabase/config.toml)
 *  - Caller MUST present either:
 *      Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>   (exact match, constant time), OR
 *      x-cron-secret: <EXPIRE_TRIALS_SECRET>               (exact match, constant time)
 *  - Any other caller (including anon/authenticated JWTs) is rejected with 403.
 *
 * SECURITY: we never inspect JWT claims to decide authorization — the signature is not
 * verified here, so a forged token claiming role=service_role must NOT be accepted.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // --- Authorization gate ----------------------------------------------------
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  // Segredo de cron: usa o segredo dedicado quando existir e, senão, o segredo
  // de cron da plataforma (mesmo valor guardado no cofre e usado pelos demais
  // agendamentos). Aceito SOMENTE por cabeçalho.
  const expectedSecret = Deno.env.get("EXPIRE_TRIALS_SECRET") ??
    Deno.env.get("PLUGGY_CRON_SECRET") ?? "";

  const authHeader = req.headers.get("Authorization") ?? "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const cronSecret = req.headers.get("x-cron-secret") ?? "";

  const isServiceRoleKey = timingSafeEqual(bearer, serviceRoleKey ?? "");
  const isCronSecret = expectedSecret.length > 0 &&
    timingSafeEqual(cronSecret, expectedSecret);

  if (!isServiceRoleKey && !isCronSecret) {
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

    // Single transaction: expires trials AND time-limited exemptions atomically.
    const { data, error } = await supabase.rpc("expire_trials_and_exemptions");
    if (error) throw error;

    const result = (data ?? {}) as {
      expired_count?: number;
      exemptions_expired?: number;
    };

    return new Response(
      JSON.stringify({
        ok: true,
        expired_count: result.expired_count ?? 0,
        exemptions_expired: result.exemptions_expired ?? 0,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (err) {
    console.error("[expire-trials] error", err);
    return new Response(
      JSON.stringify({ ok: false, error: "internal_error" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
