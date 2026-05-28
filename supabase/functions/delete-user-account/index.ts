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

// Tables that should be hard-deleted for the user
const DELETE_TABLES = [
  "transaction_attachments",
  "transaction_tags",
  "transactions",
  "budgets",
  "category_companies",
  "categories",
  "contact_companies",
  "contacts",
  "payment_method_companies",
  "payment_methods",
  "cost_centers",
  "tags",
  "accounts",
  "company_invites",
  "company_members",
  "companies",
  "user_roles",
  "legal_acceptances",
  "profiles",
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
    const userEmail = userData.user.email;

    const body = await req.json().catch(() => ({}));
    const password = typeof body?.password === "string" ? body.password : "";
    const email = typeof body?.email === "string" ? body.email : userEmail;

    if (!password || password.length < 6) {
      return json({ error: "Senha obrigatória" }, 400);
    }
    if (!email || email.toLowerCase() !== (userEmail ?? "").toLowerCase()) {
      return json({ error: "E-mail inválido" }, 400);
    }

    // Re-validate password
    const validateClient = createClient(SUPABASE_URL, ANON_KEY);
    const { error: signErr } = await validateClient.auth.signInWithPassword({ email, password });
    if (signErr) return json({ error: "Senha incorreta" }, 403);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Best-effort cleanup of storage attachments
    try {
      const { data: list } = await admin.storage
        .from("transaction-attachments")
        .list(userId, { limit: 1000 });
      if (list && list.length > 0) {
        const paths = list.map((f) => `${userId}/${f.name}`);
        await admin.storage.from("transaction-attachments").remove(paths);
      }
    } catch {
      // noop
    }

    // Delete owned company rows in related tables first (where company_id is in user's companies)
    const { data: ownedCompanies } = await admin
      .from("companies")
      .select("id")
      .eq("user_id", userId);
    const companyIds = (ownedCompanies ?? []).map((c) => c.id as string);

    if (companyIds.length > 0) {
      await admin.from("transactions").delete().in("company_id", companyIds);
      await admin.from("accounts").delete().in("company_id", companyIds);
      await admin.from("company_invites").delete().in("company_id", companyIds);
      await admin.from("company_members").delete().in("company_id", companyIds);
    }

    const errors: Record<string, string> = {};
    for (const t of DELETE_TABLES) {
      try {
        const { error } = await admin.from(t).delete().eq("user_id", userId);
        if (error) errors[t] = error.message;
      } catch (e) {
        errors[t] = e instanceof Error ? e.message : "unknown";
      }
    }

    // Audit before removing auth user
    try {
      await admin.from("audit_logs").insert({
        user_id: userId,
        user_name: userEmail ?? null,
        action: "account_self_deleted",
        entity_type: "user",
        entity_id: userId,
        details: { errors },
      } as never);
    } catch {
      // noop
    }

    const { error: delAuthErr } = await admin.auth.admin.deleteUser(userId);
    if (delAuthErr) return json({ error: delAuthErr.message }, 500);

    return json({ ok: true, errors });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Erro interno" }, 500);
  }
});
