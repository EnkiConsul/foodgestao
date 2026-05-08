import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type Target =
  | { type: "user"; userId: string }
  | { type: "company"; companyId: string }
  | { type: "self" };

type ContextFilter = "pf" | "pj" | "both";

interface Payload {
  target: Target;
  scope: string[];
  context: ContextFilter;
}

const SCOPE_KEYS = [
  "transactions",
  "accounts",
  "categories",
  "contacts",
  "payment_methods",
  "budgets",
  "cost_centers",
  "tags",
  "companies",
  "audit_logs",
] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return json({ error: "Não autenticado" }, 401);
    }

    // Validate user from JWT
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return json({ error: "Sessão inválida" }, 401);
    }
    const callerId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Check super admin
    const { data: roleData } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("role", "super_admin")
      .maybeSingle();

    if (!roleData) {
      return json({ error: "Apenas super admins podem executar reset" }, 403);
    }

    const body = (await req.json()) as Payload;
    if (!body?.target?.type || !Array.isArray(body.scope)) {
      return json({ error: "Payload inválido" }, 400);
    }
    const context: ContextFilter = body.context ?? "both";
    const scope = new Set(body.scope.filter((s) => SCOPE_KEYS.includes(s as any)));
    if (scope.size === 0) {
      return json({ error: "Selecione ao menos um item para apagar" }, 400);
    }

    // Resolve target filter
    let userIdFilter: string | null = null;
    let companyIdFilter: string | null = null;
    if (body.target.type === "user") {
      userIdFilter = body.target.userId;
    } else if (body.target.type === "self") {
      userIdFilter = callerId;
    } else if (body.target.type === "company") {
      companyIdFilter = body.target.companyId;
    } else {
      return json({ error: "Alvo inválido" }, 400);
    }

    const counts: Record<string, number> = {};

    // Helper: apply context filter to a query if column exists
    const applyContext = (q: any) => {
      if (context === "both") return q;
      return q.eq("context", context);
    };

    // Helper: apply target filter
    const applyTarget = (q: any, opts: { hasCompany?: boolean } = {}) => {
      if (companyIdFilter) return q.eq("company_id", companyIdFilter);
      if (userIdFilter) {
        let qq = q.eq("user_id", userIdFilter);
        if (context === "pf" && opts.hasCompany) {
          qq = qq.is("company_id", null);
        } else if (context === "pj" && opts.hasCompany) {
          qq = qq.not("company_id", "is", null);
        }
        return qq;
      }
      return q;
    };

    // 1) Transactions (and its children)
    if (scope.has("transactions")) {
      // Get target transaction ids
      let txQ = admin.from("transactions").select("id, attachment_url");
      txQ = applyTarget(txQ, { hasCompany: true });
      txQ = applyContext(txQ);
      const { data: txs } = await txQ;
      const txIds = (txs ?? []).map((t: any) => t.id);

      if (txIds.length > 0) {
        // Delete attachments rows
        const { data: atts } = await admin
          .from("transaction_attachments")
          .select("file_url")
          .in("transaction_id", txIds);
        if (atts && atts.length > 0) {
          const paths = atts
            .map((a: any) => extractStoragePath(a.file_url))
            .filter(Boolean) as string[];
          if (paths.length > 0) {
            await admin.storage.from("transaction-attachments").remove(paths);
          }
        }
        await admin.from("transaction_attachments").delete().in("transaction_id", txIds);
        await admin.from("transaction_tags").delete().in("transaction_id", txIds);
        const { count } = await admin
          .from("transactions")
          .delete({ count: "exact" })
          .in("id", txIds);
        counts.transactions = count ?? txIds.length;
      } else {
        counts.transactions = 0;
      }
    }

    // 2) Accounts
    if (scope.has("accounts")) {
      let q = admin.from("accounts").delete({ count: "exact" });
      q = applyTarget(q, { hasCompany: true });
      q = applyContext(q);
      const { count } = await q;
      counts.accounts = count ?? 0;
    }

    // 3) Categories (user-scoped only)
    if (scope.has("categories") && userIdFilter) {
      let catQ = admin.from("categories").select("id");
      catQ = catQ.eq("user_id", userIdFilter);
      if (context !== "both") catQ = catQ.eq("context", context);
      const { data: cats } = await catQ;
      const catIds = (cats ?? []).map((c: any) => c.id);
      if (catIds.length > 0) {
        await admin.from("category_companies").delete().in("category_id", catIds);
        const { count } = await admin
          .from("categories")
          .delete({ count: "exact" })
          .in("id", catIds);
        counts.categories = count ?? catIds.length;
      } else {
        counts.categories = 0;
      }
    }

    // 4) Contacts (user-scoped)
    if (scope.has("contacts") && userIdFilter) {
      const { data: cs } = await admin
        .from("contacts")
        .select("id")
        .eq("user_id", userIdFilter);
      const ids = (cs ?? []).map((c: any) => c.id);
      if (ids.length > 0) {
        await admin.from("contact_companies").delete().in("contact_id", ids);
        const { count } = await admin
          .from("contacts")
          .delete({ count: "exact" })
          .in("id", ids);
        counts.contacts = count ?? ids.length;
      } else {
        counts.contacts = 0;
      }
    }

    // 5) Payment methods (user-scoped)
    if (scope.has("payment_methods") && userIdFilter) {
      const { data: pms } = await admin
        .from("payment_methods")
        .select("id")
        .eq("user_id", userIdFilter);
      const ids = (pms ?? []).map((p: any) => p.id);
      if (ids.length > 0) {
        await admin.from("payment_method_companies").delete().in("payment_method_id", ids);
        const { count } = await admin
          .from("payment_methods")
          .delete({ count: "exact" })
          .in("id", ids);
        counts.payment_methods = count ?? ids.length;
      } else {
        counts.payment_methods = 0;
      }
    }

    // 6) Budgets (user-scoped)
    if (scope.has("budgets") && userIdFilter) {
      let q = admin.from("budgets").delete({ count: "exact" }).eq("user_id", userIdFilter);
      if (context !== "both") q = q.eq("context", context);
      const { count } = await q;
      counts.budgets = count ?? 0;
    }

    // 7) Cost centers (user-scoped)
    if (scope.has("cost_centers") && userIdFilter) {
      const { count } = await admin
        .from("cost_centers")
        .delete({ count: "exact" })
        .eq("user_id", userIdFilter);
      counts.cost_centers = count ?? 0;
    }

    // 8) Tags (user-scoped)
    if (scope.has("tags") && userIdFilter) {
      const { count } = await admin
        .from("tags")
        .delete({ count: "exact" })
        .eq("user_id", userIdFilter);
      counts.tags = count ?? 0;
    }

    // 9) Companies (only for user target)
    if (scope.has("companies") && userIdFilter) {
      const { data: comps } = await admin
        .from("companies")
        .select("id")
        .eq("user_id", userIdFilter);
      const ids = (comps ?? []).map((c: any) => c.id);
      if (ids.length > 0) {
        await admin.from("company_invites").delete().in("company_id", ids);
        await admin.from("company_members").delete().in("company_id", ids);
        const { count } = await admin
          .from("companies")
          .delete({ count: "exact" })
          .in("id", ids);
        counts.companies = count ?? ids.length;
      } else {
        counts.companies = 0;
      }
    }

    // 10) Audit logs
    if (scope.has("audit_logs") && userIdFilter) {
      const { count } = await admin
        .from("audit_logs")
        .delete({ count: "exact" })
        .eq("user_id", userIdFilter);
      counts.audit_logs = count ?? 0;
    }

    // Log the action
    await admin.from("audit_logs").insert({
      user_id: callerId,
      action: "reset_data",
      entity_type: "system",
      entity_id: userIdFilter ?? companyIdFilter ?? null,
      details: {
        target: body.target,
        scope: Array.from(scope),
        context,
        counts,
      },
    });

    return json({ success: true, counts });
  } catch (e) {
    console.error("admin-reset-data error", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extractStoragePath(url: string): string | null {
  try {
    const marker = "/transaction-attachments/";
    const i = url.indexOf(marker);
    if (i === -1) return null;
    return decodeURIComponent(url.substring(i + marker.length));
  } catch {
    return null;
  }
}
