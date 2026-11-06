/**
 * Onboarding Concierge: envia ao gestor o link de primeiro acesso da empresa
 * que a Aveto preparou. Só super admin. A mensagem muda quando o gestor já
 * tem conta (entra com a senha de sempre).
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.23.8";
import { normalizeBRPhone, sendZapiText } from "../_shared/zapi.ts";
import { sendTemplateEmail } from "../_shared/transactional-email-templates/send-email.ts";
import { mensagemApoio, type EntregaApoio } from "../_shared/concierge-entrega.ts";

const APP_URL = "https://aveto360.com";
const Body = z.object({ companyId: z.string().uuid() });

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function primeiroNome(n: string) {
  const p = (n ?? "").trim().split(/\s+/)[0] ?? "";
  return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : "";
}

export function mensagemConcierge(o: { nome: string; empresa: string; link: string; contaExistente: boolean; temPessoas: boolean }) {
  const nome = primeiroNome(o.nome);
  if (o.contaExistente) {
    return `Olá${nome ? `, ${nome}` : ""}! A equipe da *AVETO 360* acabou de vincular a *${o.empresa}* ao seu acesso.\n\n` +
      (o.temPessoas ? "A loja inicial está pronta e as fichas da equipe já foram carregadas para você conferir.\n\n" : "") +
      `Entre com sua senha de sempre para aceitar:\n👉 ${o.link}\n\nQualquer dúvida, estamos por aqui!`;
  }
  const itens = o.temPessoas
    ? "✅ Empresa e loja inicial já configuradas\n✅ Fichas da equipe carregadas: você só confere e aprova\n✅ Escala de folgas inteligente: domingos e feriados sem risco\n✅ Tudo no celular: documentos assinados na palma da mão"
    : "✅ Empresa já configurada\n✅ Plano de contas e categorias prontos para food service\n✅ Contas a pagar e receber no celular";
  return `Olá${nome ? `, ${nome}` : ""}! Aqui é da equipe da *AVETO 360*.\n\n` +
    `Preparamos o ambiente da *${o.empresa}* para você não perder tempo com cadastros:\n\n${itens}\n\n` +
    `Para criar sua senha e começar agora (leva menos de 1 minuto):\n👉 ${o.link}\n\n` +
    `Seus 7 dias de teste grátis começam quando você criar a senha. Qualquer dúvida, estamos por aqui!`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);
  try {
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: "Dados inválidos" }, 400);

    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return json({ error: "Serviço indisponível" }, 503);
    const admin = createClient(url, key);
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Faça login" }, 401);
    const { data: claimsRes } = await admin.auth.getClaims(auth.slice(7));
    const uid = (claimsRes?.claims as Record<string, unknown> | undefined)?.sub as string | undefined;
    if (!uid) return json({ error: "Faça login" }, 401);
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: uid, _role: "super_admin" });
    if (!isAdmin) return json({ error: "Sem permissão" }, 403);

    const { data: p } = await admin.from("concierge_provisionamentos")
      .select("company_id, invite_id, gestor_nome, gestor_email, gestor_whatsapp, modulos, conta_existente, ativado_em, modo, parametrizacao_concluida_em, entrega_resumo, companies(name, trade_name, trial_termina_em)")
      .eq("company_id", parsed.data.companyId).maybeSingle();
    if (!p) return json({ error: "Empresa não encontrada" }, 404);
    if (p.modo === "apoio") {
      if (!p.parametrizacao_concluida_em) return json({ error: "Conclua a parametrização antes de avisar o cliente." }, 409);
      // deno-lint-ignore no-explicit-any
      const e = (p as any).companies;
      const entrega = (p.entrega_resumo ?? { modo_trial: "manter", prazos: [], unidades: 0, fichas: 0 }) as EntregaApoio;
      const msg = mensagemApoio({ nome: p.gestor_nome, empresa: e?.trade_name || e?.name || "sua empresa", temPessoas: (p.modulos ?? []).includes("dp"), entrega });
      const phone = normalizeBRPhone(p.gestor_whatsapp);
      let whatsapp = false; let whatsappErro: string | null = phone ? null : "Gestor sem WhatsApp";
      if (phone) {
        try {
          const r = await sendZapiText(phone, msg);
          whatsapp = r.ok;
          if (!r.ok) whatsappErro = String(r.error ?? `HTTP ${r.httpStatus}`);
        } catch { whatsappErro = "Falha no envio pelo WhatsApp"; }
      }
      let email = false; let emailErro: string | null = null;
      if (p.gestor_email) {
        try {
          const r = await sendTemplateEmail("concierge-conclusao", p.gestor_email, {
            idempotencyKey: `concierge-conclusao-${p.company_id}-${p.parametrizacao_concluida_em}`,
            templateData: { message: msg },
          });
          email = r.sent;
          if (!r.sent) emailErro = "Destinatário indisponível para e-mail";
        } catch { emailErro = "Falha no envio por e-mail"; }
      }
      const upd: Record<string, string> = {};
      if (whatsapp) upd.whatsapp_enviado_em = new Date().toISOString();
      if (email) upd.email_enviado_em = new Date().toISOString();
      if (Object.keys(upd).length) {
        const { error } = await admin.from("concierge_provisionamentos").update(upd).eq("company_id", p.company_id);
        if (error) return json({ error: "Aviso enviado, mas não foi possível atualizar o histórico." }, 500);
      }
      return json({ success: whatsapp || email, whatsapp, email, whatsappErro, emailErro });
    }
    if (p.ativado_em) return json({ error: "O gestor já ativou o acesso." }, 409);

    const { data: inv } = await admin.from("company_invites").select("token, status, expires_at").eq("id", p.invite_id).maybeSingle();
    if (!inv || inv.status !== "pending" || new Date(inv.expires_at) < new Date()) {
      return json({ error: "O link expirou. Gere um novo link antes de enviar." }, 410);
    }
    // deno-lint-ignore no-explicit-any
    const emp = (p as any).companies;
    const empresa = emp?.trade_name || emp?.name || "sua empresa";
    const link = `${APP_URL}/convite/${inv.token}`;
    const temPessoas = (p.modulos ?? []).includes("dp");
    const msg = mensagemConcierge({ nome: p.gestor_nome, empresa, link, contaExistente: p.conta_existente, temPessoas });
    const agora = new Date().toISOString();

    let whatsapp = false; let whatsappErro: string | null = null;
    const phone = normalizeBRPhone(p.gestor_whatsapp);
    if (phone) {
      const r = await sendZapiText(phone, msg);
      whatsapp = r.ok;
      if (!r.ok) whatsappErro = String(r.error ?? `HTTP ${r.httpStatus}`);
    }

    let email = false;
    if (p.gestor_email) {
      try {
        const r = await sendTemplateEmail("company-invite", p.gestor_email, {
          idempotencyKey: `concierge-${p.invite_id}`,
          templateData: { companyName: empresa, inviterName: "A equipe AVETO 360", role: "owner", inviteUrl: link },
        });
        email = !!r.sent;
      } catch (e) {
        console.error("concierge email falhou", e instanceof Error ? e.message : String(e));
      }
    }

    const upd: Record<string, string> = {};
    if (whatsapp) upd.whatsapp_enviado_em = agora;
    if (email) upd.email_enviado_em = agora;
    if (Object.keys(upd).length) await admin.from("concierge_provisionamentos").update(upd).eq("company_id", p.company_id);

    return json({ success: whatsapp || email, whatsapp, email, whatsappErro, link });
  } catch (e) {
    console.error("concierge-entregar-acesso", e);
    return json({ error: "Erro interno" }, 500);
  }
});
