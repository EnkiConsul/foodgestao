// supabase/functions/asaas-webhook-worker/index.ts
// Worker da fila de webhooks do Asaas (pg_cron a cada minuto).
//
// - claim de lote com FOR UPDATE SKIP LOCKED (dois workers nunca pegam o mesmo evento)
// - processamento idempotente por evento
// - falha → retry com backoff exponencial; no limite de tentativas → dead letter
// - erro em um evento não interrompe o lote
//
// verify_jwt = false — protegido pelo header secreto interno (WEBHOOK_WORKER_SECRET,
// com fallback para PLUGGY_CRON_SECRET, o segredo compartilhado dos jobs internos).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WORKER_SECRET = Deno.env.get("WEBHOOK_WORKER_SECRET") ?? Deno.env.get("PLUGGY_CRON_SECRET");

const BATCH_SIZE = 25;
const LEASE_SECONDS = 120;
const MAX_RUN_MS = 50_000;

function secretMatches(provided: string | null, expected: string | undefined): boolean {
  if (!expected || !provided) return false;
  const a = new TextEncoder().encode(provided);
  const b = new TextEncoder().encode(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type Admin = ReturnType<typeof createClient>;

/** Lógica de negócio de um evento do Asaas. Deve ser idempotente. */
async function processEvent(admin: Admin, eventType: string, payload: any) {
  const payment = payload?.payment ?? null;
  const subscription = payload?.subscription ?? null;

  if (payment?.id) {
    let { data: inv } = await admin
      .from("invoices").select("*")
      .eq("external_invoice_id", payment.id).maybeSingle();

    // Fatura recorrente gerada pelo Asaas: cria a linha local
    if (!inv && payment.subscription) {
      const { data: subRow } = await admin
        .from("subscriptions")
        .select("id, user_id")
        .eq("external_subscription_id", payment.subscription)
        .maybeSingle();
      if (subRow) {
        const billingType = String(payment.billingType ?? "").toUpperCase();
        const method =
          billingType === "PIX" ? "pix" :
          billingType === "BOLETO" ? "boleto" :
          billingType === "CREDIT_CARD" ? "credit_card" : null;
        const { data: inserted, error: insErr } = await admin.from("invoices").insert({
          subscription_id: (subRow as any).id,
          user_id: (subRow as any).user_id,
          amount_cents: Math.round(Number(payment.value ?? 0) * 100),
          status: "open",
          due_date: payment.dueDate ?? new Date().toISOString().slice(0, 10),
          external_invoice_id: payment.id,
          external_payment_url: payment.invoiceUrl ?? null,
          payment_method: method as any,
        }).select().single();
        if (insErr && insErr.code !== "23505") throw new Error(`invoice_insert: ${insErr.message}`);
        if (inserted) inv = inserted as any;
        if (!inserted) {
          const { data: again } = await admin
            .from("invoices").select("*").eq("external_invoice_id", payment.id).maybeSingle();
          inv = again as any;
        }
      }
    }

    if (inv) {
      const invoice = inv as any;
      if (["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED", "PAYMENT_RECEIVED_IN_CASH"].includes(eventType)) {
        const nowIso = new Date().toISOString();
        await admin.from("invoices").update({
          status: "paid",
          paid_at: nowIso,
          amount_cents: Math.round(Number(payment.value ?? invoice.amount_cents / 100) * 100),
        }).eq("id", invoice.id);
        if (invoice.subscription_id) {
          const { data: sub } = await admin
            .from("subscriptions")
            .select("id, plan:plans(billing_period)")
            .eq("id", invoice.subscription_id)
            .maybeSingle();
          const period = (sub as any)?.plan?.billing_period ?? "monthly";
          const nextEnd = new Date();
          if (period === "yearly") nextEnd.setFullYear(nextEnd.getFullYear() + 1);
          else if (period === "quarterly") nextEnd.setMonth(nextEnd.getMonth() + 3);
          else nextEnd.setMonth(nextEnd.getMonth() + 1);
          await admin.from("subscriptions").update({
            status: "active",
            current_period_start: nowIso,
            current_period_end: nextEnd.toISOString(),
            canceled_at: null,
            cancel_at_period_end: false,
          }).eq("id", invoice.subscription_id);
        }
      } else if (eventType === "PAYMENT_OVERDUE") {
        await admin.from("invoices").update({ status: "overdue" }).eq("id", invoice.id);
        if (invoice.subscription_id) {
          await admin.from("subscriptions").update({ status: "past_due" })
            .eq("id", invoice.subscription_id);
        }
      } else if (["PAYMENT_REFUNDED", "PAYMENT_REFUND_IN_PROGRESS"].includes(eventType)) {
        await admin.from("invoices").update({ status: "refunded" }).eq("id", invoice.id);
      } else if (["PAYMENT_DELETED", "PAYMENT_CHARGEBACK_REQUESTED", "PAYMENT_CHARGEBACK_DISPUTE"].includes(eventType)) {
        await admin.from("invoices").update({ status: "canceled" }).eq("id", invoice.id);
      } else if (eventType === "PAYMENT_UPDATED") {
        await admin.from("invoices").update({
          amount_cents: Math.round(Number(payment.value ?? invoice.amount_cents / 100) * 100),
          due_date: payment.dueDate ?? invoice.due_date,
          external_payment_url: payment.invoiceUrl ?? invoice.external_payment_url,
        }).eq("id", invoice.id);
      }
    }
  }

  if (subscription?.id && eventType === "SUBSCRIPTION_DELETED") {
    await admin.from("subscriptions").update({
      status: "canceled", canceled_at: new Date().toISOString(),
    }).eq("external_subscription_id", subscription.id);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const provided = req.headers.get("x-worker-secret") ??
    new URL(req.url).searchParams.get("secret");
  if (!secretMatches(provided, WORKER_SECRET)) {
    return new Response("forbidden", { status: 403, headers: corsHeaders });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const workerId = `asaas-worker-${crypto.randomUUID().slice(0, 8)}`;
  const startedAt = Date.now();

  const { data: claimed, error: claimErr } = await admin.rpc("asaas_webhook_claim", {
    _worker: workerId, _batch: BATCH_SIZE, _lease_seconds: LEASE_SECONDS,
  });
  if (claimErr) {
    console.error("asaas-webhook-worker: claim failed", claimErr);
    return json({ error: "claim_failed", detail: claimErr.message }, 500);
  }

  const events = (claimed ?? []) as Array<{
    id: string; event_id: string; event_type: string; payload: any;
    attempt_count: number; max_attempts: number;
  }>;

  let processed = 0, retried = 0, dead = 0, skipped = 0;

  for (const ev of events) {
    if (Date.now() - startedAt > MAX_RUN_MS) {
      // Deixa o restante para a próxima rodada: o lease expira e volta para a fila.
      skipped++;
      continue;
    }
    try {
      await processEvent(admin, ev.event_type, ev.payload);
      await admin.rpc("asaas_webhook_finalize_success", { _event_id: ev.id, _worker: workerId });
      processed++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`asaas-webhook-worker: event ${ev.event_id} failed`, msg);
      const { data: status } = await admin.rpc("asaas_webhook_finalize_failure", {
        _event_id: ev.id, _worker: workerId, _error: msg,
        _error_code: "processing_error", _fatal: false,
      });
      if (status === "dead_letter") dead++; else retried++;
    }
  }

  return json({ ok: true, worker: workerId, claimed: events.length, processed, retried, dead, skipped });
});
