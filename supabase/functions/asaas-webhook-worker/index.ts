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
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

/**
 * Comparação de segredos em tempo constante (inline: o bundler desta função não
 * resolve `../_shared/`). Segredo aceito SOMENTE por cabeçalho.
 */
function secretMatches(
  provided: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (!expected || !provided) return false;
  const a = new TextEncoder().encode(provided);
  const b = new TextEncoder().encode(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}


const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WORKER_SECRET = Deno.env.get("WEBHOOK_WORKER_SECRET") ?? Deno.env.get("PLUGGY_CRON_SECRET");

const BATCH_SIZE = 25;
const LEASE_SECONDS = 120;
const MAX_RUN_MS = 50_000;
const SITE_URL = "https://www.aveto360.com";

const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Pagamento confirmado: cancela as mensagens pendentes da fatura e enfileira a
 * mensagem de reativação. Em seguida acorda a régua para o envio imediato.
 */
async function pararReguaEAvisar(admin: SupabaseClient, invoice: any): Promise<void> {
  try {
    await admin.from("billing_notifications")
      .update({ status: "cancelled", last_error: "pagamento confirmado" })
      .eq("invoice_id", invoice.id).eq("status", "pending");

    const { data: sub } = await admin.from("subscriptions")
      .select("id, user_id, company_id").eq("id", invoice.subscription_id).maybeSingle();
    if (!sub) return;

    const { data: comp } = await admin.from("companies")
      .select("id, name, email, user_id")
      .or(`id.eq.${(sub as any).company_id ?? invoice.id},user_id.eq.${(sub as any).user_id}`)
      .order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (!comp) return;

    const { data: dono } = await admin.auth.admin.getUserById(String((comp as any).user_id));
    const { data: perfil } = await admin.from("profiles").select("full_name")
      .eq("user_id", String((comp as any).user_id)).maybeSingle();

    const destinos = new Set<string>();
    const donoEmail = dono?.user?.email?.toLowerCase();
    if (donoEmail) destinos.add(donoEmail);
    const fin = (comp as any).email?.toLowerCase?.().trim();
    if (fin && fin.includes("@")) destinos.add(fin);

    const payload = {
      stage: "reativacao",
      nome: ((perfil?.full_name as string | null) ?? "").split(" ")[0] || null,
      empresa: (comp as any).name ?? undefined,
      valor: brl(Number(invoice.amount_cents ?? 0)),
      link: `${SITE_URL}/assinatura`,
      linkPlanos: `${SITE_URL}/planos`,
    };

    for (const email of destinos) {
      const { error } = await admin.from("billing_notifications").insert({
        company_id: (comp as any).id,
        subscription_id: (sub as any).id,
        invoice_id: invoice.id,
        stage: "reativacao",
        channel: "email",
        recipient: email,
        payload,
      });
      if (error && error.code !== "23505") {
        console.error("asaas-webhook-worker: reativacao enqueue", error.code, error.message);
      }
    }

    // acorda a régua para enviar a confirmação sem esperar a rotina diária
    await fetch(`${SUPABASE_URL}/functions/v1/billing-dunning`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
      body: JSON.stringify({ trigger: "payment_confirmed" }),
    }).catch(() => {});
  } catch (e) {
    console.error("asaas-webhook-worker: pararReguaEAvisar", e instanceof Error ? e.message : e);
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type Admin = SupabaseClient;

/** Situação da NFS-e derivada do evento/payload do Asaas. */
function fiscalStatus(eventType: string, invoice: any): string {
  const raw = String(invoice?.status ?? "").toUpperCase();
  if (raw) return raw.toLowerCase();
  if (eventType === "INVOICE_AUTHORIZED") return "authorized";
  if (eventType === "INVOICE_CANCELED") return "canceled";
  if (eventType === "INVOICE_ERROR") return "error";
  return "processing";
}

/** Lógica de negócio de um evento do Asaas. Deve ser idempotente. */
async function processEvent(admin: Admin, eventType: string, payload: any) {
  const payment = payload?.payment ?? null;
  const subscription = payload?.subscription ?? null;
  const fiscal = payload?.invoice ?? null;

  // ---- Nota fiscal de serviço (NFS-e) emitida pelo Asaas ----
  if (eventType.startsWith("INVOICE_") && fiscal?.id) {
    const paymentId = fiscal.payment ?? fiscal.paymentId ?? null;
    if (paymentId) {
      const patch = {
        fiscal_invoice_id: String(fiscal.id),
        fiscal_invoice_number: fiscal.number ? String(fiscal.number) : null,
        fiscal_invoice_status: fiscalStatus(eventType, fiscal),
        fiscal_invoice_pdf_url: fiscal.pdfUrl ?? null,
        fiscal_invoice_xml_url: fiscal.xmlUrl ?? null,
        fiscal_issued_at: fiscal.effectiveDate ?? fiscal.issueDate ?? null,
      };
      const { error: fiscalErr } = await admin
        .from("invoices")
        .update(patch)
        .eq("external_invoice_id", String(paymentId));
      if (fiscalErr) throw new Error(`fiscal_update: ${fiscalErr.message}`);
    }
    return;
  }


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
        // Régua de cobrança: o pagamento interrompe tudo e dispara a reativação.
        await pararReguaEAvisar(admin, invoice);
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

  // Segredo SOMENTE por cabeçalho (query string vaza em logs/referer).
  const provided = req.headers.get("x-worker-secret");
  if (!secretMatches(provided, WORKER_SECRET)) {
    return new Response("forbidden", { status: 403, headers: corsHeaders });
  }

  const admin: Admin = createClient(SUPABASE_URL, SERVICE_ROLE);
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
