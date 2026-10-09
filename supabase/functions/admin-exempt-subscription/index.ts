import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { asaasFetch, parseAsaasEnv } from "../_shared/asaas.ts";

const BodySchema = z.object({
  subscriptionId: z.string().uuid(),
  planId: z.string().uuid(),
  mode: z.enum(["permanent", "until"]),
  exemptUntil: z.string().datetime().optional().nullable(),
  reason: z.string().max(500).optional().nullable(),
  motivoCodigo: z.enum(["base_anterior","parceria","piloto","compensacao","comercial","outro"]).default("outro"),
});

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const auth = req.headers.get("Authorization") ?? "";

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u.user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: isSuper } = await admin.rpc("is_super_admin", { _user_id: u.user.id });
    if (!isSuper) return json({ error: "Forbidden" }, 403);

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
    const { subscriptionId, planId, mode, exemptUntil, reason, motivoCodigo } = parsed.data;
    if (mode === "permanent" && motivoCodigo !== "base_anterior") {
      return json({ error: "Cortesia permanente só é permitida com o motivo \"Base anterior\". Escolha uma data fim." }, 400);
    }

    if (mode === "until") {
      if (!exemptUntil) return json({ error: "exemptUntil required" }, 400);
      if (new Date(exemptUntil) <= new Date()) {
        return json({ error: "exemptUntil must be in the future" }, 400);
      }
    }

    const { data: sub, error: subErr } = await admin
      .from("subscriptions").select("*").eq("id", subscriptionId).maybeSingle();
    if (subErr || !sub) return json({ error: "Subscription not found" }, 404);

    // Cliente pagante: cancelar no Asaas ANTES de isentar; falha aborta a isenção.
    if (sub.external_subscription_id) {
      let asaasOk = false; let asaasErro: string | null = null; let asaasResp: unknown = null;
      try {
        const r: any = await asaasFetch(`/subscriptions/${sub.external_subscription_id}`, { method: "DELETE" }, parseAsaasEnv((sub as any).asaas_env));
        asaasResp = { deleted: r?.deleted ?? null, id: r?.id ?? sub.external_subscription_id };
        asaasOk = true;
      } catch (e) {
        asaasErro = (e as Error).message?.slice(0, 300) ?? "erro desconhecido";
      }
      await admin.from("audit_logs").insert({
        user_id: u.user.id,
        action: asaasOk ? "asaas_subscription_canceled_for_exemption" : "asaas_subscription_cancel_failed",
        entity_type: "subscription",
        entity_id: subscriptionId,
        details: { external_subscription_id: sub.external_subscription_id, resposta: asaasResp, erro: asaasErro },
      });
      if (!asaasOk) {
        return json({
          error: `Não foi possível cancelar a cobrança no Asaas (${asaasErro}). A isenção não foi aplicada; tente novamente ou cancele a assinatura no Asaas e repita.`,
        }, 502);
      }
    }

    const exempt_until = mode === "until" ? exemptUntil : null;

    const { error: updErr } = await admin.rpc("billing_v2_exempt", {
      _sub: subscriptionId, _plan: planId, _until: exempt_until, _motivo: motivoCodigo,
      _texto: reason ?? null, _actor: u.user.id,
    });
    if (updErr) return json({ error: updErr.message }, 500);

    await admin.from("audit_logs").insert({
      user_id: u.user.id,
      action: "subscription_exempted",
      entity_type: "subscription",
      entity_id: subscriptionId,
      details: { target_user_id: sub.user_id, plan_id: planId, mode, exempt_until, motivo_codigo: motivoCodigo, reason: reason ?? null },
    });

    return json({ ok: true });
  } catch (e) {
    console.error("[admin-exempt] error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
