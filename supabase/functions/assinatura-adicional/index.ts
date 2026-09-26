import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";

/**
 * Contratação de adicionais pelo próprio dono da assinatura.
 *
 * Fail-closed: só o titular (subscriptions.user_id) pode contratar, alterar a
 * quantidade ou cancelar. O preço vem SEMPRE do catálogo (plan_addons) — nunca
 * do cliente — e a cortesia (is_exempt) é exclusiva do Backoffice.
 */
const BodySchema = z.union([
  z.object({
    action: z.literal("contratar"),
    subscriptionId: z.string().uuid(),
    addonId: z.string().uuid(),
    quantity: z.number().int().min(1).max(999),
  }),
  z.object({
    action: z.literal("quantidade"),
    subscriptionId: z.string().uuid(),
    itemId: z.string().uuid(),
    quantity: z.number().int().min(1).max(999),
  }),
  z.object({
    action: z.literal("cancelar"),
    subscriptionId: z.string().uuid(),
    itemId: z.string().uuid(),
  }),
]);

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
    if (!u.user) return json({ error: "Não autenticado" }, 401);

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: "Dados inválidos" }, 400);
    const body = parsed.data;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: sub } = await admin
      .from("subscriptions")
      .select("id, user_id, module, status, is_exempt, exempt_until, plan:plans(slug, module)")
      .eq("id", body.subscriptionId)
      .maybeSingle();
    if (!sub) return json({ error: "Assinatura não encontrada" }, 404);
    if (sub.user_id !== u.user.id) return json({ error: "Sem permissão" }, 403);
    if (sub.status === "canceled" || sub.status === "expired") {
      return json({ error: "Esta assinatura não está ativa." }, 400);
    }

    if (body.action === "contratar") {
      const { data: addon } = await admin
        .from("plan_addons")
        .select("id, module, name, price_cents, max_quantity, allowed_plan_slugs, is_active")
        .eq("id", body.addonId)
        .maybeSingle();
      if (!addon || !addon.is_active) return json({ error: "Adicional indisponível" }, 400);

      const planSlug = (sub as any).plan?.slug ?? null;
      const module = sub.module ?? (sub as any).plan?.module ?? null;
      if (module && addon.module !== module) {
        return json({ error: "Adicional não pertence ao módulo desta assinatura." }, 400);
      }
      const allowed: string[] = addon.allowed_plan_slugs ?? [];
      if (allowed.length > 0 && planSlug && !allowed.includes(planSlug)) {
        return json({ error: "Este adicional não está disponível no seu plano." }, 400);
      }
      if (addon.max_quantity && body.quantity > addon.max_quantity) {
        return json({ error: `Quantidade máxima deste adicional: ${addon.max_quantity}.` }, 400);
      }

      const { data: existing } = await admin
        .from("subscription_addons")
        .select("id, quantity")
        .eq("subscription_id", sub.id)
        .eq("addon_id", addon.id)
        .eq("status", "active")
        .maybeSingle();

      if (existing) {
        const novaQtd = existing.quantity + body.quantity;
        if (addon.max_quantity && novaQtd > addon.max_quantity) {
          return json({ error: `Quantidade máxima deste adicional: ${addon.max_quantity}.` }, 400);
        }
        const { error } = await admin
          .from("subscription_addons")
          .update({ quantity: novaQtd })
          .eq("id", existing.id);
        if (error) return json({ error: error.message }, 500);
      } else {
        const { error } = await admin.from("subscription_addons").insert({
          subscription_id: sub.id,
          addon_id: addon.id,
          quantity: body.quantity,
          price_cents: addon.price_cents,
          is_exempt: false,
          status: "active",
          created_by: u.user.id,
          notes: "Contratado pelo titular na área de assinatura",
        });
        if (error) return json({ error: error.message }, 500);
      }

      await admin.from("audit_logs").insert({
        user_id: u.user.id,
        action: "subscription_addon_self_contracted",
        entity_type: "subscription_addon",
        entity_id: sub.id,
        details: { addon_id: addon.id, addon: addon.name, quantity: body.quantity },
      });
      return json({ ok: true });
    }

    // Alterações em um item já existente: precisa pertencer à assinatura.
    const { data: item } = await admin
      .from("subscription_addons")
      .select("id, subscription_id, status, quantity, is_exempt, addon:plan_addons(name, max_quantity)")
      .eq("id", body.itemId)
      .maybeSingle();
    if (!item || item.subscription_id !== sub.id) return json({ error: "Adicional não encontrado" }, 404);
    if (item.status !== "active") return json({ error: "Este adicional já está cancelado." }, 400);

    if (body.action === "quantidade") {
      const max = (item as any).addon?.max_quantity ?? null;
      if (max && body.quantity > max) {
        return json({ error: `Quantidade máxima deste adicional: ${max}.` }, 400);
      }
      const { error } = await admin
        .from("subscription_addons")
        .update({ quantity: body.quantity })
        .eq("id", item.id);
      if (error) return json({ error: error.message }, 500);
      await admin.from("audit_logs").insert({
        user_id: u.user.id,
        action: "subscription_addon_self_quantity",
        entity_type: "subscription_addon",
        entity_id: item.id,
        details: { de: item.quantity, para: body.quantity },
      });
      return json({ ok: true });
    }

    const { error } = await admin
      .from("subscription_addons")
      .update({ status: "canceled", canceled_at: new Date().toISOString() })
      .eq("id", item.id);
    if (error) return json({ error: error.message }, 500);
    await admin.from("audit_logs").insert({
      user_id: u.user.id,
      action: "subscription_addon_self_canceled",
      entity_type: "subscription_addon",
      entity_id: item.id,
      details: { addon: (item as any).addon?.name ?? null },
    });
    return json({ ok: true });
  } catch (e) {
    console.error("[assinatura-adicional] error", e);
    return json({ error: e instanceof Error ? e.message : "Erro inesperado" }, 500);
  }
});
