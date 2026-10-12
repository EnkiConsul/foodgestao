/**
 * Confirmação do cadastro pelo WhatsApp.
 * - enviar: gera código de 6 dígitos (10 min), guarda só o hash e envia pelo WhatsApp da Aveto.
 * - verificar: confere o código, confirma a conta e grava o WhatsApp no perfil.
 * Só atua em contas ainda não confirmadas, criadas há menos de 24h, cujo e-mail confere.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "https://esm.sh/zod@3.23.8";
import { checkZapiStatus, sendZapiText, normalizeBRPhone, timingSafeEqualHex } from "../_shared/zapi.ts";

const Body = z.object({
  acao: z.enum(["enviar", "verificar"]),
  user_id: z.string().uuid(),
  email: z.string().trim().email().max(255),
  whatsapp: z.string().trim().max(24).optional(),
  codigo: z.string().trim().regex(/^\d{6}$/).optional(),
});

const TTL_MS = 10 * 60 * 1000;
const COOLDOWN_MS = 60 * 1000;
const MAX_ENVIOS = 5;
const MAX_TENTATIVAS = 5;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function sha(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
function otp6() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return (a[0] % 1_000_000).toString().padStart(6, "0");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Método não permitido." });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json(400, { error: "Dados inválidos." });
  const b = parsed.data;

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: u } = await admin.auth.admin.getUserById(b.user_id);
  const user = u?.user;
  if (!user || (user.email ?? "").toLowerCase() !== b.email.toLowerCase()) {
    return json(400, { error: "Cadastro não encontrado. Faça o cadastro novamente." });
  }
  if (user.email_confirmed_at) return json(200, { status: "ja_confirmado" });
  if (Date.now() - new Date(user.created_at).getTime() > 24 * 3600 * 1000) {
    return json(400, { error: "Cadastro expirado. Use a confirmação por e-mail ou cadastre-se novamente." });
  }

  const { data: row } = await admin.from("signup_whatsapp_otps").select("*").eq("user_id", user.id).maybeSingle();

  if (b.acao === "enviar") {
    const phone = normalizeBRPhone(b.whatsapp ?? (user.user_metadata?.whatsapp as string | undefined));
    if (!phone) return json(400, { error: "WhatsApp inválido. Informe o número com DDD." });
    if (row && Date.now() - new Date(row.last_sent_at).getTime() < COOLDOWN_MS) {
      return json(429, { error: "Aguarde 1 minuto para pedir um novo código." });
    }
    if (row && row.sends >= MAX_ENVIOS) {
      return json(429, { error: "Limite de envios atingido. Use a confirmação por e-mail." });
    }
    const st = await checkZapiStatus();
    if (!st.connected) {
      return json(503, { error: "O WhatsApp da Aveto está indisponível agora. Use a confirmação por e-mail." });
    }
    const codigo = otp6();
    const payload = {
      user_id: user.id,
      phone,
      code_hash: await sha(`${user.id}:${codigo}`),
      expires_at: new Date(Date.now() + TTL_MS).toISOString(),
      attempts: 0,
      sends: (row?.sends ?? 0) + 1,
      last_sent_at: new Date().toISOString(),
    };
    await admin.from("signup_whatsapp_otps").upsert(payload, { onConflict: "user_id" });
    if (b.whatsapp) {
      await admin.auth.admin.updateUserById(user.id, { user_metadata: { ...user.user_metadata, whatsapp: phone } });
    }
    const r = await sendZapiText(phone, `Seu código de confirmação AVETO 360 é: ${codigo}\n\nVálido por 10 minutos. Não compartilhe.`);
    if (!r.ok) return json(502, { error: "Não conseguimos entregar no número informado. Confira o WhatsApp ou use o e-mail." });
    return json(200, { status: "enviado", final: phone.slice(-4) });
  }

  // verificar
  if (!b.codigo) return json(400, { error: "Informe o código de 6 dígitos." });
  if (!row) return json(400, { error: "Peça um código primeiro." });
  if (new Date(row.expires_at).getTime() < Date.now()) return json(400, { error: "Código expirado. Peça um novo." });
  if (row.attempts >= MAX_TENTATIVAS) return json(429, { error: "Muitas tentativas. Peça um novo código." });
  const ok = timingSafeEqualHex(await sha(`${user.id}:${b.codigo}`), row.code_hash);
  if (!ok) {
    await admin.from("signup_whatsapp_otps").update({ attempts: row.attempts + 1 }).eq("id", row.id);
    return json(400, { error: "Código incorreto." });
  }
  const { error: e1 } = await admin.auth.admin.updateUserById(user.id, { email_confirm: true });
  if (e1) return json(500, { error: "Não foi possível ativar a conta. Tente novamente." });
  await admin.from("signup_whatsapp_otps").update({ verified_at: new Date().toISOString() }).eq("id", row.id);
  await admin.from("profiles").update({ phone: row.phone }).eq("user_id", user.id);
  return json(200, { status: "confirmado" });
});
