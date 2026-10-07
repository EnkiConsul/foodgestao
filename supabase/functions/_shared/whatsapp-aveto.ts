/**
 * Disparo oficial pelo WhatsApp da Aveto 360 (Z-API). Não registra o corpo da
 * mensagem em logs. Quando recebe o contexto, grava a tentativa em
 * dp_whatsapp_envios (acompanhamento em Comunicação → Envios WhatsApp).
 */
import { checkZapiStatus, normalizeBRPhone, sendZapiText } from "./zapi.ts";

export type EnvioWhatsapp = { enviado: boolean; erro?: string; final?: string };

export type ContextoEnvio = {
  // deno-lint-ignore no-explicit-any
  admin: any;
  companyId: string;
  tipo: "acesso" | "senha" | "recibo";
  colaboradorId?: string | null;
  reciboId?: string | null;
  nome?: string | null;
  link?: string | null;
  enviadoPor?: string | null;
};

export function primeiroNome(nome: string | null | undefined): string {
  const p = String(nome ?? "").trim().split(/\s+/)[0] ?? "";
  return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : "";
}

/** Saudação usa o nome social quando existir (mensagem do dia a dia). */
export function primeiroNomeExibicao(p: { nome?: string | null; nome_social?: string | null } | null | undefined): string {
  const social = String(p?.nome_social ?? "").trim();
  return primeiroNome(social || p?.nome);
}

async function registrar(ctx: ContextoEnvio | undefined, telefone: string | null, r: { ok: boolean; erro?: string; messageId?: string }) {
  if (!ctx) return;
  try {
    await ctx.admin.from("dp_whatsapp_envios").insert({
      company_id: ctx.companyId,
      colaborador_id: ctx.colaboradorId ?? null,
      recibo_id: ctx.reciboId ?? null,
      tipo: ctx.tipo,
      destinatario_nome: ctx.nome ?? null,
      telefone,
      status: r.ok ? "enviado" : "falhou",
      erro: r.ok ? null : r.erro ?? null,
      message_id: r.messageId ?? null,
      link: ctx.link ?? null,
      enviado_por: ctx.enviadoPor ?? null,
    });
  } catch (_e) {
    console.error("[whatsapp-aveto] falha ao registrar envio");
  }
}

export async function enviarWhatsappAveto(
  telefone: string | null | undefined,
  mensagem: string,
  ctx?: ContextoEnvio,
): Promise<EnvioWhatsapp> {
  const phone = normalizeBRPhone(telefone);
  const bruto = String(telefone ?? "").replace(/\D+/g, "") || null;
  if (!phone) {
    const erro = "WhatsApp da ficha inválido ou ausente. Corrija o número com DDD e tente de novo.";
    await registrar(ctx, bruto, { ok: false, erro });
    return { enviado: false, erro };
  }
  const st = await checkZapiStatus();
  if (!st.connected) {
    const erro = "O WhatsApp da Aveto está temporariamente indisponível. Tente de novo em alguns minutos.";
    await registrar(ctx, phone, { ok: false, erro });
    return { enviado: false, erro };
  }
  const r = await sendZapiText(phone, mensagem);
  if (!r.ok) {
    const erro = "Não foi possível entregar a mensagem neste número. Confira o WhatsApp da ficha.";
    await registrar(ctx, phone, { ok: false, erro });
    return { enviado: false, erro };
  }
  await registrar(ctx, phone, { ok: true, messageId: r.messageId });
  return { enviado: true, final: phone.slice(-4) };
}
