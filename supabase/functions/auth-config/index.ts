// Public config for the auth pages (Turnstile site key). No auth required.
// The site key is a publishable value; the env var can override the default.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const DEFAULT_TURNSTILE_SITE_KEY = "0x4AAAAAAD8NercrKUKyuZHo";

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const siteKey = Deno.env.get("TURNSTILE_SITE_KEY")?.trim() || DEFAULT_TURNSTILE_SITE_KEY;
  return new Response(
    JSON.stringify({ turnstile_site_key: siteKey }),
    { headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=300" } },
  );
});
