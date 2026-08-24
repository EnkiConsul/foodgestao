import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { asaasFetch, centsToBrl } from "../_shared/asaas.ts";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
    const user = userData.user;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Current active subscription + plan
    const { data: sub, error: subErr } = await admin
      .from("subscriptions")
      .select("*, plan:plans(*)")
      .eq("user_id", user.id)
      .in("status", ["trialing", "active", "past_due", "pending"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (subErr) throw subErr;
    if (!sub) return json({ error: "Sem assinatura ativa" }, 400);

    const plan: any = sub.plan;
    const features = (plan?.features ?? {}) as Record<string, any>;
    const included = Number(features.included_companies ?? features.max_companies ?? 1);
    const maxCompanies = Number(features.max_companies ?? included);
    const pricePerExtraCents = Number(features.price_per_extra_company_cents ?? 0);

    // Count user companies
    const { count, error: cntErr } = await admin
      .from("companies")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    if (cntErr) throw cntErr;
    const totalCompanies = count ?? 0;

    // Assinatura isenta: nunca cobra perfil extra nem aplica limite do plano.
    const exemptActive =
      Boolean(sub.is_exempt) &&
      (!sub.exempt_until || new Date(sub.exempt_until as string) > new Date());
    if (exemptActive) {
      if (sub.extra_companies !== 0) {
        await admin.from("subscriptions").update({ extra_companies: 0 }).eq("id", sub.id);
      }
      return json({
        ok: true,
        extra: 0,
        included,
        total: totalCompanies,
        billed: false,
        exempt: true,
      });
    }

    // Validate against absolute max when extras not allowed
    if (pricePerExtraCents <= 0) {
      if (maxCompanies >= 0 && totalCompanies > maxCompanies) {
        return json({
          error: "Limite de perfis do plano atingido",
          maxCompanies,
        }, 409);
      }
      // Nothing to bill — keep extra_companies at 0
      if (sub.extra_companies !== 0) {
        await admin.from("subscriptions").update({ extra_companies: 0 }).eq("id", sub.id);
      }
      return json({ ok: true, extra: 0, included, total: totalCompanies, billed: false });
    }

    const extra = Math.max(0, totalCompanies - included);

    if (extra === sub.extra_companies) {
      return json({ ok: true, extra, included, total: totalCompanies, billed: false, unchanged: true });
    }

    // Persist new count
    const { error: updErr } = await admin
      .from("subscriptions")
      .update({ extra_companies: extra })
      .eq("id", sub.id);
    if (updErr) throw updErr;

    // Sync Asaas subscription value (if external subscription exists)
    let asaasSynced = false;
    if (sub.external_subscription_id && plan?.price_cents != null) {
      const newValueCents = plan.price_cents + extra * pricePerExtraCents;
      try {
        await asaasFetch(`/subscriptions/${sub.external_subscription_id}`, {
          method: "PUT",
          body: JSON.stringify({
            value: centsToBrl(newValueCents),
            description: `${plan.name} — ${included} perfil(is) incluso(s) + ${extra} extra(s)`,
            updatePendingPayments: true,
          }),
        });
        asaasSynced = true;
      } catch (e) {
        console.error("Asaas update failed:", e);
      }
    }

    // Audit log
    try {
      await admin.from("audit_logs").insert({
        user_id: user.id,
        action: "company_quota_synced",
        entity_type: "subscription",
        entity_id: sub.id,
        details: { extra, included, total: totalCompanies, asaasSynced },
      });
    } catch { /* non-fatal */ }

    return json({ ok: true, extra, included, total: totalCompanies, billed: true, asaasSynced });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message ?? "Erro" }, 500);
  }
});
