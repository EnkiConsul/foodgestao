// V1 cleanup — relata (dry_run) ou arquiva rows V1 de uma empresa já promovida para V2.
// Autorização: super_admin apenas. Por segurança, nunca deleta transactions materializadas;
// apenas marca connections como status='archived' e limpa o raw (reproduzível via V2 backfill).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

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

  const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
  if (claimsErr || !claims?.claims?.sub) return json({ error: "unauthenticated" }, 401);
  const userId = claims.claims.sub as string;

  const { data: isAdmin } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "super_admin",
  });
  if (!isAdmin) return json({ error: "forbidden" }, 403);

  let body: { company_id?: string; confirm?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const companyId = body.company_id;
  const confirm = !!body.confirm;
  if (!companyId) return json({ error: "missing_company_id" }, 400);

  // Guard: empresa deve estar em v2
  const { data: company } = await supabase
    .from("companies")
    .select("id, name, pluggy_version")
    .eq("id", companyId)
    .maybeSingle();
  if (!company) return json({ error: "company_not_found" }, 404);
  if (company.pluggy_version !== "v2") {
    return json({ error: "company_not_on_v2", detail: "Promova a empresa para v2 antes do cleanup." }, 400);
  }

  // Contagens
  const [{ count: connCount }, { count: rawCount }, { count: acctCount }] = await Promise.all([
    supabase.from("open_finance_connections").select("id", { count: "exact", head: true }).eq("company_id", companyId),
    supabase.from("open_finance_transactions_raw").select("id", { count: "exact", head: true }).eq("company_id", companyId),
    supabase.from("open_finance_accounts").select("id", { count: "exact", head: true }).eq("company_id", companyId),
  ]);

  if (!confirm) {
    return json({
      ok: true,
      dry_run: true,
      company: { id: company.id, name: company.name },
      counts: {
        connections: connCount ?? 0,
        raw_transactions: rawCount ?? 0,
        accounts: acctCount ?? 0,
      },
    });
  }

  // Arquiva connections e apaga raw (reproduzível via backfill V2).
  const nowIso = new Date().toISOString();
  const { error: connErr } = await supabase
    .from("open_finance_connections")
    .update({ status: "archived", updated_at: nowIso })
    .eq("company_id", companyId);
  if (connErr) return json({ error: "archive_connections_failed", detail: connErr.message }, 500);

  const { error: rawErr } = await supabase
    .from("open_finance_transactions_raw")
    .delete()
    .eq("company_id", companyId);
  if (rawErr) return json({ error: "delete_raw_failed", detail: rawErr.message }, 500);

  return json({
    ok: true,
    dry_run: false,
    company: { id: company.id, name: company.name },
    archived: {
      connections: connCount ?? 0,
      raw_transactions_deleted: rawCount ?? 0,
    },
  });
});
