// Public config for the auth pages (Turnstile site key). No auth required.
// The site key is a publishable value, pinned to the active Cloudflare widget.
// Em domínios de preview/localhost devolvemos a site key de teste do Cloudflare:
// o widget de produção só aceita os hostnames cadastrados no painel e devolve 110200.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { TEST_SITE_KEY, turnstileModeFor } from "../_shared/turnstile-env.ts";

const DEFAULT_TURNSTILE_SITE_KEY = "0x4AAAAAAD8NercrKUKyuZHo";

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const mode = turnstileModeFor(req);
  const siteKey = mode === "test" ? TEST_SITE_KEY : DEFAULT_TURNSTILE_SITE_KEY;
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
