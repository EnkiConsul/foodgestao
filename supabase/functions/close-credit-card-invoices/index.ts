// Fecha faturas de cartão de crédito diariamente.
//
// Fluxo:
// 1. Autentica via header `x-close-secret` == CLOSE_INVOICES_SECRET.
// 2. Busca faturas com status='aberta' e closing_date < CURRENT_DATE.
// 3. Para cada fatura:
//    - Recalcula totais materializados.
//    - Marca 'fechada', calcula minimum_amount = total_amount * (minimum_payment_percent/100).
//    - Cria a conta a pagar em transactions (is_invoice_payment=true) na conta padrão do cartão.
//    - Abre a fatura do próximo ciclo (idempotente via UNIQUE credit_card_id+reference_month).
//
// verify_jwt = false — protegido pelo header secreto (mesmo padrão de expire-trials).

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLOSE_SECRET = Deno.env.get("CLOSE_INVOICES_SECRET");

interface CardRow {
  id: string;
  user_id: string;
  company_id: string | null;
  closing_day: number;
  due_day: number;
  default_payment_account_id: string | null;
  minimum_payment_percent: number;
}

interface InvoiceRow {
  id: string;
  credit_card_id: string;
  company_id: string | null;
  user_id: string;
  reference_month: string;
  closing_date: string;
  due_date: string;
  total_amount: number;
  minimum_amount: number;
  status: string;
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}
function resolveDay(year: number, month: number, day: number) {
  const d = Math.min(day, daysInMonth(year, month));
  return `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function nextRefMonth(refMonth: string): { year: number; month: number } {
  const [y, m] = refMonth.split("-").map(Number);
  const total = y * 12 + (m - 1) + 1;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!CLOSE_SECRET || req.headers.get("x-close-secret") !== CLOSE_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const today = new Date().toISOString().slice(0, 10);

  // 1. Busca faturas a fechar
  const { data: invoices, error: invErr } = await supabase
    .from("credit_card_invoices")
    .select("id,credit_card_id,company_id,user_id,reference_month,closing_date,due_date,total_amount,minimum_amount,status")
    .eq("status", "aberta")
    .lt("closing_date", today)
    .limit(500);

  if (invErr) {
    console.error("fetch invoices failed", invErr);
    return new Response(JSON.stringify({ error: invErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const summary = { closed: 0, opened: 0, payables: 0, errors: [] as string[] };
  if (!invoices?.length) {
    return new Response(JSON.stringify({ ok: true, ...summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 2. Carrega cartões relacionados de uma vez
  const cardIds = [...new Set(invoices.map((i) => i.credit_card_id))];
  const { data: cards } = await supabase
    .from("credit_cards")
    .select("id,user_id,company_id,closing_day,due_day,default_payment_account_id,minimum_payment_percent")
    .in("id", cardIds);
  const cardById = new Map<string, CardRow>((cards ?? []).map((c: CardRow) => [c.id, c]));

  for (const inv of invoices as InvoiceRow[]) {
    const card = cardById.get(inv.credit_card_id);
    if (!card) continue;

    try {
      // 2a. Recalcula totais
      await supabase.rpc("recalc_credit_card_invoice_totals", { _invoice_id: inv.id });

      // 2b. Lê totais atualizados
      const { data: freshInv } = await supabase
        .from("credit_card_invoices")
        .select("total_amount")
        .eq("id", inv.id)
        .single();

      const totalAmount = Number(freshInv?.total_amount ?? inv.total_amount ?? 0);
      const minimumAmount = Math.round((totalAmount * (card.minimum_payment_percent / 100)) * 100) / 100;

      // 2c. Fecha
      await supabase
        .from("credit_card_invoices")
        .update({
          status: "fechada",
          minimum_amount: minimumAmount,
          closed_at: new Date().toISOString(),
        })
        .eq("id", inv.id)
        .eq("status", "aberta"); // guard contra reprocesso concorrente
      summary.closed += 1;

      // 2d. Cria conta a pagar se houver valor e conta padrão definida
      if (totalAmount > 0 && card.default_payment_account_id) {
        const { data: payable, error: payErr } = await supabase
          .from("transactions")
          .insert({
            user_id: inv.user_id,
            company_id: inv.company_id,
            account_id: card.default_payment_account_id,
            transaction_type: "saida",
            transaction_date: inv.due_date,
            due_date: inv.due_date,
            amount: totalAmount,
            amount_paid: 0,
            description: `Fatura do cartão — ref. ${inv.reference_month.slice(0, 7)}`,
            status: "pendente",
            is_invoice_payment: true,
            credit_card_invoice_id: inv.id,
          })
          .select("id")
          .single();
        if (payErr) {
          summary.errors.push(`payable ${inv.id}: ${payErr.message}`);
        } else if (payable?.id) {
          await supabase
            .from("credit_card_invoices")
            .update({ payment_transaction_id: payable.id })
            .eq("id", inv.id);
          summary.payables += 1;
        }
      }

      // 2e. Abre a próxima fatura (idempotente via UNIQUE)
      const { year: ny, month: nm } = nextRefMonth(inv.reference_month);
      const nextClosing = resolveDay(ny, nm, card.closing_day);
      const dueMonthShift = card.due_day > card.closing_day ? 0 : 1;
      const dueTotal = ny * 12 + (nm - 1) + dueMonthShift;
      const dueY = Math.floor(dueTotal / 12);
      const dueM = (dueTotal % 12) + 1;
      const nextDue = resolveDay(dueY, dueM, card.due_day);
      const nextPeriodStart = (() => {
        // dia seguinte ao closing_date atual
        const d = new Date(inv.closing_date);
        d.setDate(d.getDate() + 1);
        return d.toISOString().slice(0, 10);
      })();

      const { error: openErr } = await supabase
        .from("credit_card_invoices")
        .upsert(
          {
            credit_card_id: card.id,
            company_id: card.company_id,
            user_id: card.user_id,
            reference_month: `${ny}-${String(nm).padStart(2, "0")}-01`,
            period_start: nextPeriodStart,
            closing_date: nextClosing,
            due_date: nextDue,
            status: "aberta",
          },
          { onConflict: "credit_card_id,reference_month", ignoreDuplicates: true },
        );
      if (!openErr) summary.opened += 1;
      else summary.errors.push(`open next ${inv.id}: ${openErr.message}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`close invoice ${inv.id} failed`, msg);
      summary.errors.push(`${inv.id}: ${msg}`);
    }
  }

  return new Response(JSON.stringify({ ok: true, ...summary }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
