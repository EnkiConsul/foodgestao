// Régua de cobrança e trial do AVETO 360 — 100% por e-mail.
//
// Duas etapas numa única invocação:
//  1) apura o estágio do dia (public.billing_dunning_scan) e enfileira os
//     e-mails devidos em public.billing_notifications (índice único impede
//     duplicidade mesmo se a rotina rodar de novo);
//  2) drena a fila pendente, reconferindo se a fatura segue em aberto antes
//     de cada disparo.
//
// Autorização: verify_jwt = false. Aceita apenas
//   Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>  ou
//   x-cron-secret: <BILLING_DUNNING_SECRET | PLUGGY_CRON_SECRET>
// Nenhuma claim de JWT é inspecionada.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { sendTemplateEmail } from "../_shared/transactional-email-templates/send-email.ts";
import { STAGE_NUMERO } from "../_shared/transactional-email-templates/billing-copy.ts";

const SITE_URL = "https://www.aveto360.com";
const LOTE = 200;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });

const brl = (cents?: number | null) =>
  typeof cents === "number"
    ? (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "em aberto";

const dataBR = (iso?: string | null) => {
  if (!iso) return null;
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : null;
};

const somaDias = (iso: string, dias: number) => {
  const dt = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + dias);
  return dt.toISOString().slice(0, 10);
};

const NIVEIS: Record<string, number> = {
  none: 0, consulta: 1, view: 1, inclusao: 2, alteracao: 3, total: 4, edit: 4,
};

type ScanRow = {
  company_id: string;
  subscription_id: string;
  invoice_id: string | null;
  stage: string;
  dias: number | null;
  amount_cents: number | null;
  due_date: string | null;
  expira_em: string | null;
  owner_user_id: string;
  company_name: string | null;
  company_cnpj: string | null;
  company_email: string | null;
  payment_url: string | null;
  modulo: string | null;
};

function nomeModulo(m: string | null): string | undefined {
  if (!m) return undefined;
  if (m === 'financeiro' || m === 'financial') return 'Financeiro 360°';
  if (m === 'dp' || m === 'pessoas') return 'Pessoas 360°';
  return undefined;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const expectedSecret = Deno.env.get("BILLING_DUNNING_SECRET") ??
    Deno.env.get("PLUGGY_CRON_SECRET") ?? "";

  const authHeader = req.headers.get("Authorization") ?? "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  const cronSecret = req.headers.get("x-cron-secret") ?? "";

  const ok = timingSafeEqual(bearer, serviceRoleKey) ||
    (expectedSecret.length > 0 && timingSafeEqual(cronSecret, expectedSecret));
  if (!ok) return json({ ok: false, error: "Forbidden" }, 403);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceRoleKey);

  const emailCache = new Map<string, string | null>();
  async function emailDe(userId: string): Promise<string | null> {
    if (emailCache.has(userId)) return emailCache.get(userId) ?? null;
    const { data } = await admin.auth.admin.getUserById(userId);
    const mail = data?.user?.email?.toLowerCase() ?? null;
    emailCache.set(userId, mail);
    return mail;
  }

  const nomeCache = new Map<string, string | null>();
  async function nomeDe(userId: string): Promise<string | null> {
    if (nomeCache.has(userId)) return nomeCache.get(userId) ?? null;
    const { data } = await admin.from("profiles").select("full_name").eq("user_id", userId)
      .maybeSingle();
    const nome = (data?.full_name as string | null)?.split(" ")[0] ?? null;
    nomeCache.set(userId, nome);
    return nome;
  }

  /** Dono + membros com conta.assinatura (>= consulta) + e-mail financeiro da empresa. */
  async function destinatarios(row: ScanRow): Promise<{ email: string; nome: string | null }[]> {
    const saida = new Map<string, string | null>();

    const donoEmail = await emailDe(row.owner_user_id);
    if (donoEmail) saida.set(donoEmail, await nomeDe(row.owner_user_id));

    const { data: membros } = await admin.from("company_members")
      .select("user_id, role, permissions, modulos, situacao")
      .eq("company_id", row.company_id);

    for (const m of membros ?? []) {
      if (m.situacao !== "ativo") continue;
      const role = String(m.role ?? "");
      const moduloOk = (m.modulos as Record<string, boolean> | null)?.conta === true;
      const nivel = NIVEIS[String((m.permissions as Record<string, string> | null)?.["conta.assinatura"] ?? "none")] ?? 0;
      if (!(["owner", "admin"].includes(role) || (moduloOk && nivel >= 1))) continue;
      const mail = await emailDe(String(m.user_id));
      if (mail && !saida.has(mail)) saida.set(mail, await nomeDe(String(m.user_id)));
    }

    const financeiro = row.company_email?.toLowerCase().trim();
    if (financeiro && financeiro.includes("@") && !saida.has(financeiro)) {
      saida.set(financeiro, null);
    }

    return [...saida.entries()].map(([email, nome]) => ({ email, nome }));
  }

  function dadosDoEstagio(row: ScanRow, nome: string | null) {
    const venc = row.due_date;
    const link = row.invoice_id
      ? `${SITE_URL}/checkout/pagamento/${row.invoice_id}`
      : `${SITE_URL}/assinatura`;
    return {
      stage: row.stage,
      nome,
      empresa: row.company_name ?? undefined,
      cnpj: row.company_cnpj ?? undefined,
      valor: row.amount_cents != null ? brl(row.amount_cents) : undefined,
      data: dataBR(venc) ?? undefined,
      diasAtraso: row.dias ?? undefined,
      dataSuspensao: venc ? dataBR(somaDias(venc, 11)) ?? undefined : undefined,
      dataRescisao: venc ? dataBR(somaDias(venc, 31)) ?? undefined : undefined,
      dataExpiracao: row.expira_em ? dataBR(row.expira_em) ?? undefined : undefined,
      link: row.payment_url ?? link,
      linkExportacao: `${SITE_URL}/acesso-bloqueado`,
      linkPlanos: `${SITE_URL}/planos`,
      modulo: nomeModulo(row.modulo),
    };
  }

  try {
    // ---------- 1) apuração e enfileiramento -------------------------------
    const { data: alvos, error: scanErr } = await admin.rpc("billing_dunning_scan");
    if (scanErr) throw scanErr;

    let enfileirados = 0;
    for (const row of (alvos ?? []) as ScanRow[]) {
      const pessoas = await destinatarios(row);
      for (const p of pessoas) {
        const payload = dadosDoEstagio(row, p.nome);
        const { error } = await admin.from("billing_notifications").insert({
          company_id: row.company_id,
          subscription_id: row.subscription_id,
          invoice_id: row.invoice_id,
          stage: row.stage,
          channel: "email",
          recipient: p.email,
          payload,
        });
        // 23505 = já enfileirado antes (índice único) → não é erro
        if (!error) enfileirados++;
        else if (error.code !== "23505") {
          console.error("[billing-dunning] enqueue:", error.code, error.message);
        }
      }
      const numero = STAGE_NUMERO[row.stage];
      if (typeof numero === "number" && numero > 0) {
        await admin.rpc("billing_set_dunning_stage", {
          _subscription_id: row.subscription_id,
          _stage: numero,
        });
      }
    }

    // ---------- 2) drenagem da fila ---------------------------------------
    const { data: fila, error: filaErr } = await admin.from("billing_notifications")
      .select("id, stage, recipient, invoice_id, subscription_id, payload, attempts")
      .eq("status", "pending")
      .lte("scheduled_at", new Date().toISOString())
      .lt("attempts", 5)
      .order("scheduled_at", { ascending: true })
      .limit(LOTE);
    if (filaErr) throw filaErr;

    let enviados = 0, cancelados = 0, falhas = 0;

    for (const item of fila ?? []) {
      // reconferência: fatura quitada no meio do caminho cancela o envio
      if (item.invoice_id && item.stage !== "reativacao") {
        const { data: fat } = await admin.from("invoices").select("status")
          .eq("id", item.invoice_id).maybeSingle();
        if (fat && !["open", "overdue"].includes(String(fat.status))) {
          await admin.from("billing_notifications")
            .update({ status: "cancelled", last_error: "fatura quitada antes do envio" })
            .eq("id", item.id);
          cancelados++;
          continue;
        }
      }

      // carência: só envia se a assinatura continua em carência
      if (String(item.stage).startsWith("grace_") && item.subscription_id) {
        const { data: sub } = await admin.from("subscriptions").select("status")
          .eq("id", item.subscription_id).maybeSingle();
        if (!sub || String(sub.status) !== "grace") {
          await admin.from("billing_notifications")
            .update({ status: "cancelled", last_error: "carência encerrada antes do envio" })
            .eq("id", item.id);
          cancelados++;
          continue;
        }
      }

      try {
        const r = await sendTemplateEmail("billing-dunning", item.recipient, {
          templateData: item.payload as Record<string, unknown>,
          idempotencyKey: `billing-dunning-${item.id}`,
        });
        if (r.sent) {
          await admin.from("billing_notifications").update({
            status: "sent",
            sent_at: new Date().toISOString(),
            attempts: (item.attempts ?? 0) + 1,
            provider_message_id: `billing-dunning-${item.id}`,
          }).eq("id", item.id);
          enviados++;
        } else {
          await admin.from("billing_notifications").update({
            status: "cancelled",
            last_error: r.reason,
            attempts: (item.attempts ?? 0) + 1,
          }).eq("id", item.id);
          cancelados++;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "erro desconhecido";
        const tentativas = (item.attempts ?? 0) + 1;
        await admin.from("billing_notifications").update({
          status: tentativas >= 5 ? "failed" : "pending",
          attempts: tentativas,
          last_error: msg.slice(0, 500),
          scheduled_at: new Date(Date.now() + tentativas * 30 * 60 * 1000).toISOString(),
        }).eq("id", item.id);
        falhas++;
        console.error("[billing-dunning] envio:", msg);
      }
    }

    return json({ ok: true, alvos: (alvos ?? []).length, enfileirados, enviados, cancelados, falhas });
  } catch (e) {
    console.error("[billing-dunning]", e instanceof Error ? e.message : e);
    return json({ ok: false, error: "Falha na régua de cobrança" }, 500);
  }
});
