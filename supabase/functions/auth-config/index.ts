// Public config for the auth pages (Turnstile site key). No auth required.
// The site key is a publishable value, pinned to the active Cloudflare widget.
// O modo (live/test) vem só de TURNSTILE_MODE no servidor — nunca do cabeçalho da requisição.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { turnstileMode, turnstileSiteKey } from "../_shared/turnstile.ts";

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const mode = turnstileMode();
  const siteKey = turnstileSiteKey();
  return new Response(
    JSON.stringify({ turnstile_site_key: siteKey, turnstile_mode: mode }),
    {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
        Vary: "Origin",
      },
    },
  );
});
