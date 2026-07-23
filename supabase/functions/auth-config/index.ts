// Public config for the auth pages (Turnstile site key). No auth required.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const siteKey = Deno.env.get("TURNSTILE_SITE_KEY") ?? "";
  return new Response(
    JSON.stringify({ turnstile_site_key: siteKey }),
    { headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=300" } },
  );
});
