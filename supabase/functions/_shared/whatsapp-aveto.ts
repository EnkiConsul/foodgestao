/**
 * Disparo oficial pelo WhatsApp da Aveto 360 (Z-API). Nunca registra telefone
 * completo nem o corpo da mensagem. Devolve motivo claro em caso de falha.
 */
import { checkZapiStatus, normalizeBRPhone, sendZapiText } from "./zapi.ts";

export type EnvioWhatsapp = { enviado: boolean; erro?: string; final?: string };

export function primeiroNome(nome: string | null | undefined): string {
  const p = String(nome ?? "").trim().split(/\s+/)[0] ?? "";
  return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : "";
}

export async function enviarWhatsappAveto(telefone: string | null | undefined, mensagem: string): Promise<EnvioWhatsapp> {
  const phone = normalizeBRPhone(telefone);
  if (!phone) return { enviado: false, erro: "WhatsApp da ficha inválido ou ausente. Corrija o número com DDD e tente de novo." };
  const st = await checkZapiStatus();
  if (!st.connected) return { enviado: false, erro: "O WhatsApp da Aveto está temporariamente indisponível. Tente de novo em alguns minutos." };
  const r = await sendZapiText(phone, mensagem);
  if (!r.ok) return { enviado: false, erro: "Não foi possível entregar a mensagem neste número. Confira o WhatsApp da ficha." };
  return { enviado: true, final: phone.slice(-4) };
}
