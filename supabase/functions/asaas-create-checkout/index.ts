// supabase/functions/asaas-create-checkout/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { asaasFetch, cycleFromBillingPeriod, centsToBrl, AsaasBillingType } from "../_shared/asaas.ts";

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

    const body = await req.json().catch(() => ({}));
    const planId: string | undefined = body.planId;
    const billingType: AsaasBillingType = (body.paymentMethod ?? "PIX").toUpperCase();
    const couponCode: string | undefined = body.couponCode?.trim()?.toUpperCase();
    const holder = body.holder ?? {};

    if (!planId) return json({ error: "planId required" }, 400);
    if (!["PIX", "BOLETO", "CREDIT_CARD", "UNDEFINED"].includes(billingType))
      return json({ error: "Invalid paymentMethod" }, 400);

    // Get plan
    const { data: plan, error: planErr } = await admin
      .from("plans").select("*").eq("id", planId).maybeSingle();
    if (planErr || !plan) return json({ error: "Plan not found" }, 404);
    if (!plan.is_active) return json({ error: "Plan inactive" }, 400);

    // Profile (for asaas_customer_id, name, document)
    const { data: profile } = await admin
      .from("profiles").select("*").eq("user_id", user.id).maybeSingle();

    // Validate coupon
    let coupon: any = null;
    let discountCents = 0;
    if (couponCode) {
      const { data: c } = await admin
        .from("coupons").select("*").eq("code", couponCode).eq("is_active", true).maybeSingle();
      if (!c) return json({ error: "Cupom inválido" }, 400);
      if (c.valid_until && new Date(c.valid_until) < new Date())
        return json({ error: "Cupom expirado" }, 400);
      if (c.max_redemptions && c.times_redeemed >= c.max_redemptions)
        return json({ error: "Cupom esgotado" }, 400);
      coupon = c;
      if (c.discount_type === "percent") {
        discountCents = Math.round(plan.price_cents * (Number(c.discount_value) / 100));
      } else {
        discountCents = Math.round(Number(c.discount_value) * 100);
      }
    }

    const amountCents = Math.max(0, plan.price_cents - discountCents);

    if (amountCents === 0) {
      // Free / fully discounted — activate directly
      const now = new Date();
      const end = new Date(now);
      if (plan.billing_period === "yearly") end.setFullYear(end.getFullYear() + 1);
      else end.setMonth(end.getMonth() + 1);

      await admin.from("subscriptions")
        .update({ status: "canceled", canceled_at: now.toISOString() })
        .eq("user_id", user.id)
        .in("status", ["trialing", "active", "past_due", "pending"]);

      const { data: sub, error: subErr } = await admin.from("subscriptions").insert({
        user_id: user.id, plan_id: plan.id, status: "active",
        current_period_start: now.toISOString(),
        current_period_end: end.toISOString(),
      }).select().single();
      if (subErr) throw subErr;

      return json({ free: true, subscriptionId: sub.id });
    }

    // ---- Customer in Asaas ----
    const customerName = profile?.full_name || user.email || "Cliente";
    const cpfCnpj = (holder.cpfCnpj || profile?.document || "").replace(/\D/g, "");
    if (!cpfCnpj || (cpfCnpj.length !== 11 && cpfCnpj.length !== 14)) {
      return json({ error: "CPF ou CNPJ é obrigatório" }, 400);
    }

    let asaasCustomerId = profile?.asaas_customer_id as string | null;
    if (!asaasCustomerId) {
      // Try find by cpfCnpj first (avoids duplicates if previous attempts)
      const search = await asaasFetch(`/customers?cpfCnpj=${cpfCnpj}`).catch(() => null);
      if (search?.data?.length) {
        asaasCustomerId = search.data[0].id;
      } else {
        const created = await asaasFetch("/customers", {
          method: "POST",
          body: JSON.stringify({
            name: customerName,
            email: user.email,
            cpfCnpj,
            mobilePhone: holder.phone || profile?.phone || undefined,
            postalCode: holder.postalCode || undefined,
            addressNumber: holder.addressNumber || undefined,
            notificationDisabled: false,
            externalReference: user.id,
          }),
        });
        asaasCustomerId = created.id;
      }
      await admin.from("profiles").update({ asaas_customer_id: asaasCustomerId }).eq("user_id", user.id);
    }

    // ---- Cancel previous active subscriptions locally + at Asaas ----
    const { data: prevSubs } = await admin
      .from("subscriptions").select("id, external_subscription_id")
      .eq("user_id", user.id)
      .in("status", ["trialing", "active", "past_due", "pending"]);

    for (const ps of prevSubs ?? []) {
      if (ps.external_subscription_id) {
        await asaasFetch(`/subscriptions/${ps.external_subscription_id}`, { method: "DELETE" })
          .catch((e) => console.warn("cancel prev asaas sub failed:", e.message));
      }
    }
    if (prevSubs?.length) {
      await admin.from("subscriptions")
        .update({ status: "canceled", canceled_at: new Date().toISOString() })
        .in("id", prevSubs.map((s) => s.id));
    }

    // ---- Create Subscription in Asaas ----
    const today = new Date();
    const nextDue = new Date(today.getTime() + 3 * 86400_000); // 3 days for the user to pay
    const nextDueStr = nextDue.toISOString().slice(0, 10);

    const subscriptionPayload: Record<string, unknown> = {
      customer: asaasCustomerId,
      billingType, // PIX | BOLETO | CREDIT_CARD | UNDEFINED
      cycle: cycleFromBillingPeriod(plan.billing_period),
      value: centsToBrl(amountCents),
      nextDueDate: nextDueStr,
      description: `${plan.name} — Aveto 360`,
      externalReference: user.id,
    };

    // For credit card via API, holder data and card token would be required.
    // We default to UNDEFINED → Asaas hosted invoice URL when CREDIT_CARD chosen
    // without inline card data, providing a safer PCI flow.
    if (billingType === "CREDIT_CARD" && !body.creditCard) {
      subscriptionPayload.billingType = "UNDEFINED";
    }

    const asaasSub = await asaasFetch("/subscriptions", {
      method: "POST",
      body: JSON.stringify(subscriptionPayload),
    });

    // First payment of the subscription
    const payments = await asaasFetch(`/subscriptions/${asaasSub.id}/payments`).catch(() => null);
    const firstPayment = payments?.data?.[0] ?? null;

    let pixQrCode: string | null = null;
    let pixCopyPaste: string | null = null;
    let boletoUrl: string | null = null;
    const invoiceUrl: string | null = firstPayment?.invoiceUrl ?? null;

    if (firstPayment) {
      if (firstPayment.billingType === "PIX" || billingType === "PIX") {
        const qr = await asaasFetch(`/payments/${firstPayment.id}/pixQrCode`).catch(() => null);
        if (qr) { pixQrCode = qr.encodedImage; pixCopyPaste = qr.payload; }
      }
      if (firstPayment.billingType === "BOLETO" || billingType === "BOLETO") {
        boletoUrl = firstPayment.bankSlipUrl ?? null;
      }
    }

    // ---- Persist subscription + invoice locally ----
    const nowIso = new Date().toISOString();
    const periodEnd = new Date(today);
    if (plan.billing_period === "yearly") periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    else periodEnd.setMonth(periodEnd.getMonth() + 1);

    const { data: sub, error: subErr } = await admin.from("subscriptions").insert({
      user_id: user.id,
      plan_id: plan.id,
      status: "pending",
      current_period_start: nowIso,
      current_period_end: periodEnd.toISOString(),
      external_customer_id: asaasCustomerId,
      external_subscription_id: asaasSub.id,
    }).select().single();
    if (subErr) throw subErr;

    const paymentMethodLocal =
      billingType === "PIX" ? "pix" :
      billingType === "BOLETO" ? "boleto" : "card";

    const { data: invoice, error: invErr } = await admin.from("invoices").insert({
      subscription_id: sub.id,
      user_id: user.id,
      amount_cents: amountCents,
      discount_cents: discountCents,
      status: "open",
      due_date: nextDueStr,
      period_start: today.toISOString().slice(0, 10),
      period_end: periodEnd.toISOString().slice(0, 10),
      payment_method: paymentMethodLocal,
      coupon_id: coupon?.id ?? null,
      external_invoice_id: firstPayment?.id ?? null,
      external_payment_url: invoiceUrl,
      pix_qrcode: pixCopyPaste,
      pix_qrcode_image: pixQrCode,
      boleto_url: boletoUrl,
    }).select().single();
    if (invErr) throw invErr;

    if (coupon) {
      await admin.from("coupon_redemptions").insert({
        coupon_id: coupon.id, user_id: user.id,
        subscription_id: sub.id, invoice_id: invoice.id,
      });
      await admin.from("coupons")
        .update({ times_redeemed: coupon.times_redeemed + 1 })
        .eq("id", coupon.id);
    }

    return json({
      subscriptionId: sub.id,
      invoiceId: invoice.id,
      amountCents,
      dueDate: nextDueStr,
      paymentMethod: paymentMethodLocal,
      paymentUrl: invoiceUrl,
      pixQrCode,       // base64 image
      pixCopyPaste,    // copia-e-cola
      boletoUrl,
    });
  } catch (e) {
    console.error("asaas-create-checkout error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return json({ error: msg }, 500);
  }
});
