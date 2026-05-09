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

// Hard cap to keep response under platform timeout (max 30s for edge funcs)
const TIMEOUT_MS = 25_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startedAt = Date.now();
  const remaining = () => TIMEOUT_MS - (Date.now() - startedAt);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Não autenticado" }, 401);

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

    // Permission check
    const { data: roleData } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("role", "super_admin")
      .maybeSingle();
    const isSuperAdmin = !!roleData;

    const body = (await req.json()) as Payload;
    if (!body?.target?.type || !Array.isArray(body.scope)) {
      return json({ error: "Payload inválido" }, 400);
    }
    const context: ContextFilter = body.context ?? "both";
    const scope = new Set(
      body.scope.filter((s) => SCOPE_KEYS.includes(s as never)),
    );
    if (scope.size === 0) {
      return json({ error: "Selecione ao menos um item para apagar" }, 400);
    }

    // Resolve target
    let userIdFilter: string | null = null;
    let companyIdFilter: string | null = null;
    if (body.target.type === "self") {
      userIdFilter = callerId;
    } else if (body.target.type === "user") {
      if (!isSuperAdmin && body.target.userId !== callerId) {
        return json(
          { error: "Sem permissão para resetar dados de outro usuário" },
          403,
        );
      }
      userIdFilter = body.target.userId;
    } else if (body.target.type === "company") {
      if (!isSuperAdmin) {
        const { data: member } = await admin
          .from("company_members")
          .select("role")
          .eq("user_id", callerId)
          .eq("company_id", body.target.companyId)
          .maybeSingle();
        if (!member || !["owner", "admin"].includes(member.role)) {
          return json(
            {
              error:
                "Apenas administradores da empresa podem resetar seus dados",
            },
            403,
          );
        }
      }
      companyIdFilter = body.target.companyId;
    } else {
      return json({ error: "Alvo inválido" }, 400);
    }

    const counts: Record<string, number> = {};

    // ─── Helpers ────────────────────────────────────────────────────────────
    // FKs já cuidam de limpar filhos via CASCADE — só removemos as linhas-raiz.
    // Storage não faz cascade, então removemos arquivos antes de deletar tx.

    const applyContext = <T>(q: T): T => {
      if (context === "both") return q;
      // @ts-expect-error chained builder
      return q.eq("context", context);
    };

    const applyTarget = <T>(
      q: T,
      opts: { hasCompany?: boolean } = {},
    ): T => {
      if (companyIdFilter) {
        // @ts-expect-error chained builder
        return q.eq("company_id", companyIdFilter);
      }
      if (userIdFilter) {
        // @ts-expect-error chained builder
        let qq = q.eq("user_id", userIdFilter);
        if (context === "pf" && opts.hasCompany) qq = qq.is("company_id", null);
        else if (context === "pj" && opts.hasCompany)
          qq = qq.not("company_id", "is", null);
        return qq;
      }
      return q;
    };

    const checkTimeout = () => {
      if (remaining() <= 0) throw new Error("Reset interrompido por timeout");
    };

    // ─── 1. Transactions: clean storage, then delete (cascades children) ───
    if (scope.has("transactions")) {
      checkTimeout();
      let txQ = admin.from("transactions").select("id");
      txQ = applyTarget(txQ, { hasCompany: true });
      txQ = applyContext(txQ);
      const { data: txs } = await txQ;
      const txIds = (txs ?? []).map((t) => t.id as string);

      if (txIds.length > 0) {
        // Storage cleanup (in batches of 500)
        const { data: atts } = await admin
          .from("transaction_attachments")
          .select("file_url")
          .in("transaction_id", txIds);
        const paths =
          atts
            ?.map((a) => extractStoragePath(a.file_url as string))
            .filter(Boolean) as string[];
        for (let i = 0; i < paths.length; i += 500) {
          await admin.storage
            .from("transaction-attachments")
            .remove(paths.slice(i, i + 500));
        }
        // CASCADE handles transaction_attachments + transaction_tags
        const { count } = await admin
          .from("transactions")
          .delete({ count: "exact" })
          .in("id", txIds);
        counts.transactions = count ?? txIds.length;
      } else {
        counts.transactions = 0;
      }
    }

    // ─── 2. Accounts ───
    if (scope.has("accounts")) {
      checkTimeout();
      let q = admin.from("accounts").delete({ count: "exact" });
      q = applyTarget(q, { hasCompany: true });
      q = applyContext(q);
      const { count } = await q;
      counts.accounts = count ?? 0;
    }

    // ─── 3. Categories (cascades category_companies) ───
    if (scope.has("categories") && userIdFilter) {
      checkTimeout();
      let q = admin
        .from("categories")
        .delete({ count: "exact" })
        .eq("user_id", userIdFilter);
      if (context !== "both") q = q.eq("context", context);
      const { count } = await q;
      counts.categories = count ?? 0;
    }

    // ─── 4. Contacts (cascades contact_companies) ───
    if (scope.has("contacts") && userIdFilter) {
      checkTimeout();
      const { count } = await admin
        .from("contacts")
        .delete({ count: "exact" })
        .eq("user_id", userIdFilter);
      counts.contacts = count ?? 0;
    }

    // ─── 5. Payment methods (cascades payment_method_companies) ───
    if (scope.has("payment_methods") && userIdFilter) {
      checkTimeout();
      const { count } = await admin
        .from("payment_methods")
        .delete({ count: "exact" })
        .eq("user_id", userIdFilter);
      counts.payment_methods = count ?? 0;
    }

    // ─── 6-8. Budgets / cost_centers / tags ───
    if (scope.has("budgets") && userIdFilter) {
      checkTimeout();
      let q = admin
        .from("budgets")
        .delete({ count: "exact" })
        .eq("user_id", userIdFilter);
      if (context !== "both") q = q.eq("context", context);
      const { count } = await q;
      counts.budgets = count ?? 0;
    }
    if (scope.has("cost_centers") && userIdFilter) {
      checkTimeout();
      const { count } = await admin
        .from("cost_centers")
        .delete({ count: "exact" })
        .eq("user_id", userIdFilter);
      counts.cost_centers = count ?? 0;
    }
    if (scope.has("tags") && userIdFilter) {
      checkTimeout();
      const { count } = await admin
        .from("tags")
        .delete({ count: "exact" })
        .eq("user_id", userIdFilter);
      counts.tags = count ?? 0;
    }

    // ─── 9. Companies (cascades company_members + company_invites) ───
    if (scope.has("companies") && userIdFilter) {
      checkTimeout();
      const { count } = await admin
        .from("companies")
        .delete({ count: "exact" })
        .eq("user_id", userIdFilter);
      counts.companies = count ?? 0;
    }

    // ─── 10. Audit logs ───
    if (scope.has("audit_logs") && userIdFilter) {
      checkTimeout();
      const { count } = await admin
        .from("audit_logs")
        .delete({ count: "exact" })
        .eq("user_id", userIdFilter);
      counts.audit_logs = count ?? 0;
    }

    // Audit the action itself
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
        took_ms: Date.now() - startedAt,
      },
    });

    return json({
      success: true,
      counts,
      took_ms: Date.now() - startedAt,
    });
  } catch (e) {
    const message = (e as Error).message ?? "erro desconhecido";
    console.error("admin-reset-data error", e);
    const isTimeout = message.includes("timeout");
    return json({ error: message }, isTimeout ? 408 : 500);
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
