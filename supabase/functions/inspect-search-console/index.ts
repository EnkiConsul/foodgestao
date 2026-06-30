import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GATEWAY_URL =
  "https://connector-gateway.lovable.dev/google_search_console/v1/urlInspection/index:inspect";

interface InspectRequest {
  urls: string[];
  siteUrl?: string;
}

interface UrlResult {
  url: string;
  ok: boolean;
  error?: string;
  verdict?: string;
  coverageState?: string;
  robotsTxtState?: string;
  indexingState?: string;
  lastCrawlTime?: string | null;
  googleCanonical?: string | null;
  userCanonical?: string | null;
  pageFetchState?: string;
  crawledAs?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth: must be super_admin
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);

    const { data: isAdmin, error: roleErr } = await supabase.rpc("is_super_admin", {
      _user_id: userData.user.id,
    });
    if (roleErr || !isAdmin) return json({ error: "Forbidden" }, 403);

    const body = (await req.json()) as InspectRequest;
    if (!body?.urls || !Array.isArray(body.urls) || body.urls.length === 0) {
      return json({ error: "urls is required" }, 400);
    }
    if (body.urls.length > 20) return json({ error: "max 20 urls" }, 400);

    const siteUrl = body.siteUrl ?? "https://gestorplin.com/";
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    const gscKey = Deno.env.get("GOOGLE_SEARCH_CONSOLE_API_KEY");
    if (!lovableKey || !gscKey) {
      return json({ error: "Search Console connector not configured" }, 500);
    }

    const results: UrlResult[] = await Promise.all(
      body.urls.map(async (url) => {
        try {
          const r = await fetch(GATEWAY_URL, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${lovableKey}`,
              "X-Connection-Api-Key": gscKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ inspectionUrl: url, siteUrl }),
          });
          const text = await r.text();
          if (!r.ok) {
            return { url, ok: false, error: `HTTP ${r.status}: ${text.slice(0, 300)}` };
          }
          const data = JSON.parse(text);
          const idx = data?.inspectionResult?.indexStatusResult ?? {};
          return {
            url,
            ok: true,
            verdict: idx.verdict,
            coverageState: idx.coverageState,
            robotsTxtState: idx.robotsTxtState,
            indexingState: idx.indexingState,
            lastCrawlTime: idx.lastCrawlTime ?? null,
            googleCanonical: idx.googleCanonical ?? null,
            userCanonical: idx.userCanonical ?? null,
            pageFetchState: idx.pageFetchState,
            crawledAs: idx.crawledAs,
          };
        } catch (e) {
          return { url, ok: false, error: (e as Error).message };
        }
      }),
    );

    return json({ siteUrl, fetchedAt: new Date().toISOString(), results });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
