import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const TABLES = [
  "profiles",
  "companies",
  "company_members",
  "company_invites",
  "accounts",
  "categories",
  "contacts",
  "payment_methods",
  "cost_centers",
  "tags",
  "budgets",
  "transactions",
  "transaction_attachments",
  "transaction_tags",
  "subscriptions",
  "invoices",
  "coupon_redemptions",
  "legal_acceptances",
] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Não autenticado" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Sessão inválida" }, 401);
    const userId = userData.user.id;
    const email = userData.user.email;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const result: Record<string, unknown> = {
      _meta: {
        exported_at: new Date().toISOString(),
        user_id: userId,
        email,
        format: "json",
        note:
          "Exportação dos seus dados pessoais conforme LGPD art. 18, V (portabilidade).",
      },
    };

    for (const t of TABLES) {
      try {
        const { data, error } = await admin.from(t).select("*").eq("user_id", userId);
        if (error) {
          result[t] = { error: error.message };
        } else {
          result[t] = data ?? [];
        }
      } catch (e) {
        result[t] = { error: e instanceof Error ? e.message : "unknown" };
      }
    }

    // Companies where user is a member (not owner)
    try {
      const { data: memberRows } = await admin
        .from("company_members")
        .select("company_id, role")
        .eq("user_id", userId);
      result["companies_member_of"] = memberRows ?? [];
    } catch {
      // noop
    }

    // Audit logs (parent table includes partitions)
    try {
      const { data: logs } = await admin
        .from("audit_logs")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(5000);
      result["audit_logs"] = logs ?? [];
    } catch {
      // noop
    }

    return json(result, 200);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Erro interno" }, 500);
  }
});
