// V2 — Backfill V1→V2: re-materializa itens Pluggy existentes de uma empresa no stack V2
// Autorização: apenas super_admin (JWT validado via getClaims)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { materializePluggyItemV2 } from "../_shared/pluggy-v2-materialize.ts";

Deno.serve(async (req) => {
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), {
      status: s,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "unauthenticated" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Valida JWT e super_admin
  const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
  if (claimsErr || !claims?.claims?.sub) return json({ error: "unauthenticated" }, 401);
  const userId = claims.claims.sub as string;

  const { data: isAdmin, error: roleErr } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "super_admin",
  });
  if (roleErr || !isAdmin) return json({ error: "forbidden" }, 403);

  let body: { company_id?: string; dry_run?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const companyId = body.company_id;
  const dryRun = !!body.dry_run;
  if (!companyId) return json({ error: "missing_company_id" }, 400);

  // Lista pluggy_item_ids únicos da V1 para essa empresa
  const { data: v1Rows, error: v1Err } = await supabase
    .from("open_finance_connections")
    .select("pluggy_item_id, created_by")
    .eq("company_id", companyId)
    .not("pluggy_item_id", "is", null);
  if (v1Err) return json({ error: "v1_query_failed", detail: v1Err.message }, 500);

  const items = Array.from(
    new Map(
      (v1Rows ?? [])
        .filter((r) => r.pluggy_item_id)
        .map((r) => [r.pluggy_item_id as string, r.created_by as string | null]),
    ).entries(),
  );

  if (dryRun) {
    return json({ ok: true, dry_run: true, items_found: items.length, items: items.map(([id]) => id) });
  }

  const results: Array<{ pluggy_item_id: string; ok: boolean; error?: string }> = [];
  for (const [pluggyItemId, createdBy] of items) {
    try {
      await materializePluggyItemV2({
        supabase,
        pluggyItemId,
        companyId,
        createdBy,
        triggerSource: "manual",
        sourceWebhookEventId: null,
        fullSync: true,
      });
      results.push({ pluggy_item_id: pluggyItemId, ok: true });
    } catch (e) {
      results.push({ pluggy_item_id: pluggyItemId, ok: false, error: (e as Error).message });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  return json({
    ok: true,
    company_id: companyId,
    items_found: items.length,
    processed: okCount,
    failed: results.length - okCount,
    results,
  });
});
