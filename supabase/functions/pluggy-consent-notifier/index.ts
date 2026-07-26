// Cron: scans open_finance_connections whose consent expires in <= 7 days
// and sends a transactional email to the connected user. Idempotent via `consent_notified_at`.
// Auth: shared secret PLUGGY_SYNC_ALL_SECRET (same infra key used by cron dispatcher).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST" && req.method !== "GET") return json(405, { error: "Method not allowed" });

  const expected = Deno.env.get("PLUGGY_SYNC_ALL_SECRET");
  const cronSecret = Deno.env.get("PLUGGY_CRON_SECRET");
  const provided = req.headers.get("x-cron-secret") ?? new URL(req.url).searchParams.get("secret");
  const ok = (expected && provided === expected) || (cronSecret && provided === cronSecret);
  if (!ok) return json(401, { error: "forbidden" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(url, service);

  const soon = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

  const { data: connections } = await supabase
    .from("open_finance_connections")
    .select("id, company_id, connected_by_user_id, institution_name, consent_expires_at, metadata")
    .not("consent_expires_at", "is", null)
    .lte("consent_expires_at", soon);

  const notified: string[] = [];
  for (const c of connections ?? []) {
    const meta = (c.metadata ?? {}) as Record<string, unknown>;
    if (meta.consent_notified_at) continue; // already notified
    try {
      await fetch(`${url}/functions/v1/send-transactional-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${service}`,
        },
        body: JSON.stringify({
          template: "open_finance_consent_expiring",
          user_id: c.connected_by_user_id,
          variables: {
            institution: c.institution_name ?? "seu banco",
            expires_at: c.consent_expires_at,
          },
        }),
      });
      await supabase
        .from("open_finance_connections")
        .update({ metadata: { ...meta, consent_notified_at: new Date().toISOString() } })
        .eq("id", c.id);
      notified.push(c.id);
    } catch (e) {
      console.error("[pluggy-consent-notifier] send failed:", e);
    }
  }

  return json(200, { notified: notified.length });
});
