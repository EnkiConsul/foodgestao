/**
 * Repasse do lote de fichas ao responsável da empresa, em nome da Aveto 360.
 * Exclusivo de super admin. Grava o aviso interno (RPC dp_ficha_lote_notificar,
 * chamada com a sessão de quem pediu), envia WhatsApp oficial da Aveto e e-mail,
 * e registra os canais no lote. Nunca cria colaboradores.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.23.8";
import { enviarWhatsappAveto } from "../_shared/whatsapp-aveto.ts";
import { normalizeBRPhone } from "../_shared/zapi.ts";
import { sendTemplateEmail } from "../_shared/transactional-email-templates/send-email.ts";
import { linkLote, mensagemLoteFicha } from "../_shared/ficha-lote-aviso.ts";

const Body = z.object({
  importacaoId: z.string().uuid(),
  userId: z.string().uuid(),
  whatsapp: z.string().trim().max(30).optional().nullable(),
});

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function erroRpc(m: string): { error: string; status: number } {
  if (/LOTE_SEM_PENDENCIAS/.test(m)) return { error: "Todas as fichas deste lote já foram concluídas.", status: 409 };
  if (/RESPONSAVEL_INVALIDO/.test(m)) return { error: "Escolha um dono ou administrador ativo da empresa.", status: 400 };
  if (/SEM_PERMISSAO/.test(m)) return { error: "Somente a equipe Aveto pode passar o lote ao responsável.", status: 403 };
  if (/LOTE_NAO_ENCONTRADO/.test(m)) return { error: "Lote não encontrado.", status: 404 };
  return { error: "Não foi possível salvar a notificação. Tente novamente.", status: 500 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);
  try {
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: "Dados inválidos" }, 400);
    const { importacaoId, userId } = parsed.data;

    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !key || !anon) return json({ error: "Serviço indisponível" }, 503);
    const admin = createClient(url, key);

    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Faça login" }, 401);
    const { data: claimsRes } = await admin.auth.getClaims(auth.slice(7));
    const uid = (claimsRes?.claims as Record<string, unknown> | undefined)?.sub as string | undefined;
    if (!uid) return json({ error: "Faça login" }, 401);
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: uid, _role: "super_admin" });
    if (!isAdmin) return json({ error: "Somente a equipe Aveto pode passar o lote ao responsável." }, 403);

    // 1) Aviso interno + validação de responsável e pendências (com a sessão de quem pediu)
    const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: rpc, error: rpcErr } = await userClient.rpc("dp_ficha_lote_notificar", {
      p_importacao_id: importacaoId, p_user_id: userId,
    });
    if (rpcErr) {
      const e = erroRpc(rpcErr.message ?? "");
      return json({ error: e.error }, e.status);
    }
    const notificacaoId = (rpc as { notificacao_id?: string })?.notificacao_id ?? null;
    const fichas = Number((rpc as { fichas?: number })?.fichas ?? 0);

    // 2) Dados do lote e do responsável
    const { data: lote } = await admin.from("dp_ficha_importacoes")
      .select("company_id, companies(name, trade_name)").eq("id", importacaoId).maybeSingle();
    // deno-lint-ignore no-explicit-any
    const emp = (lote as any)?.companies;
    const empresa = String(emp?.trade_name || emp?.name || "sua empresa").trim();
    const companyId = lote?.company_id as string;

    const { data: u } = await admin.auth.admin.getUserById(userId);
    const email = u?.user?.email ?? null;
    const { data: prof } = await admin.from("profiles").select("full_name, phone").eq("user_id", userId).maybeSingle();
    const nome = (prof?.full_name as string | null) || email;
    let telefone = (parsed.data.whatsapp || "").trim() || (prof?.phone as string | null) || null;
    if (!telefone && email) {
      const { data: cp } = await admin.from("concierge_provisionamentos")
        .select("gestor_whatsapp, gestor_email").eq("company_id", companyId).maybeSingle();
      if (cp?.gestor_whatsapp && String(cp.gestor_email ?? "").toLowerCase() === email.toLowerCase()) {
        telefone = cp.gestor_whatsapp as string;
      }
    }

    const link = linkLote(importacaoId);
    const mensagem = mensagemLoteFicha({ nome, empresa, fichas, link });

    // 3) WhatsApp oficial da Aveto (registra em dp_whatsapp_envios)
    const wa = await enviarWhatsappAveto(telefone, mensagem, {
      admin, companyId, tipo: "lote_ficha", nome, link, enviadoPor: uid,
    });

    // 4) E-mail de retaguarda
    let emailEnviado = false; let emailErro: string | null = null;
    if (email) {
      try {
        const r = await sendTemplateEmail("ficha-lote-pronto", email, {
          idempotencyKey: `ficha-lote-pronto-${notificacaoId ?? `${importacaoId}-${Date.now()}`}`,
          templateData: { nome, empresa, fichas, link },
        });
        emailEnviado = r.sent;
        if (!r.sent) emailErro = "Este e-mail pediu para não receber mensagens da Aveto.";
      } catch (e) {
        console.error("[dp-ficha-lote-notificar] e-mail falhou", e instanceof Error ? e.message : String(e));
        emailErro = "Não foi possível enviar o e-mail agora.";
      }
    } else {
      emailErro = "Responsável sem e-mail cadastrado.";
    }

    // 5) Histórico do repasse no lote
    const canais = {
      whatsapp: { enviado: wa.enviado, final: wa.final ?? null, erro: wa.enviado ? null : wa.erro ?? null },
      email: { enviado: emailEnviado, destino: email, erro: emailEnviado ? null : emailErro },
    };
    const { error: regErr } = await admin.rpc("dp_ficha_lote_registrar_canais", {
      p_importacao_id: importacaoId, p_notificacao_id: notificacaoId, p_canais: canais,
    });
    if (regErr) console.error("[dp-ficha-lote-notificar] histórico não gravado", regErr.message);

    const digitos = normalizeBRPhone(telefone);
    return json({
      success: true,
      fichas,
      whatsapp: canais.whatsapp,
      email: canais.email,
      mensagem,
      link,
      telefone_contingencia: wa.enviado ? null : digitos,
    });
  } catch (e) {
    console.error("[dp-ficha-lote-notificar]", e instanceof Error ? e.message : String(e));
    return json({ error: "Erro interno" }, 500);
  }
});
