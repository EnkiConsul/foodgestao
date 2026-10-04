/**
 * Primeiro acesso pelo CPF (mensagem única do gestor).
 *
 * O colaborador digita o CPF; se houver cadastro ativo com WhatsApp, a conta do
 * portal é criada (se ainda não existir) com senha aleatória descartada e um
 * código de 6 dígitos é enviado ao WhatsApp da ficha. As etapas seguintes
 * reutilizam auth-recovery-verify e auth-recovery-reset (mesmo desafio).
 *
 * Respostas com status explícito (pedido do negócio): cpf_nao_encontrado,
 * sem_whatsapp, ja_possui_senha, acesso_indisponivel, enviado.
 * Mitigação de enumeração: Turnstile + limite por IP e por CPF.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "https://esm.sh/zod@3.23.8";
import { checkZapiStatus, sendZapiText, normalizeBRPhone } from "../_shared/zapi.ts";
import { verifyTurnstileToken } from "../_shared/turnstile.ts";
import { isRateLimited, sha256Hex, clientIp, mensagemLimite } from "../_shared/rate-limit.ts";
import { gerarCodigo, situacaoAcesso, registrarEvento } from "../_shared/portal-access.ts";

const BodySchema = z.object({
  cpf: z.string().trim().min(11).max(20),
  turnstile_token: z.string().min(10).max(4096),
});

const OTP_TTL_SECONDS = 600;
const SYNTHETIC_EMAIL_DOMAIN = "portal.360food.local";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return [...arr].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomOTP6(): string {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return (arr[0] % 1_000_000).toString().padStart(6, "0");
}

function formatCpf(d: string) {
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function mascararTelefone(e164: string): string {
  const d = e164.replace(/\D/g, "");
  return `(••) •••••-${d.slice(-4)}`;
}

type Colab = {
  id: string;
  company_id: string;
  user_id: string | null;
  nome: string | null;
  whatsapp: string | null;
  telefone: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const admin: SupabaseClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  let body: z.infer<typeof BodySchema>;
  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json(400, { error: "Dados inválidos" });
    body = parsed.data;
  } catch {
    return json(400, { error: "JSON inválido" });
  }

  const cpf = body.cpf.replace(/\D/g, "");
  if (cpf.length !== 11) {
    return json(200, { status: "cpf_invalido" });
  }

  const ip = clientIp(req);
  const captcha = await verifyTurnstileToken({ token: body.turnstile_token, ip, contexto: "auth-primeiro-acesso" });
  if (!captcha.ok) return json(400, { error: "A verificação de segurança (anti-robô) não foi concluída. Recarregue a página, aguarde a caixa de verificação ficar verde e tente de novo.", code: "captcha_failed" });

  const ipHash = await sha256Hex(ip);
  const cpfHash = await sha256Hex(cpf);
  if (await isRateLimited(admin, "primeiro_acesso_ip", ipHash, 10)) {
    return json(429, { error: mensagemLimite("pedidos de código a partir desta rede/aparelho", 10, "peça um novo código pelo Primeiro Acesso."), code: "rate_limited" });
  }
  if (await isRateLimited(admin, "primeiro_acesso_cpf", cpfHash, 3)) {
    return json(429, { error: mensagemLimite("pedidos de código para este CPF", 3, "peça um novo código. Se já recebeu um código no WhatsApp há pouco, use esse último."), code: "rate_limited" });
  }

  // Cadastros com este CPF (formatado ou só números), não removidos.
  const { data: rows, error: qErr } = await admin
    .from("dp_colaboradores")
    .select("id, company_id, user_id, nome, whatsapp, telefone")
    .in("cpf", [cpf, formatCpf(cpf)])
    .is("deleted_at", null);
  if (qErr) {
    console.error("[auth-primeiro-acesso-cpf] query:", qErr.message);
    return json(500, { error: "Não foi possível verificar agora. Tente novamente." });
  }

  // Só cadastros com acesso permitido (fonte única: dp_portal_acesso_situacao).
  const elegiveis: Colab[] = [];
  for (const r of (rows ?? []) as Colab[]) {
    const s = await situacaoAcesso(admin, r.id).catch(() => "cadastro_nao_encontrado");
    if (s === "ok" || s === "prazo_documentos") elegiveis.push(r);
  }
  if (!rows?.length) return json(200, { status: "cpf_nao_encontrado" });
  if (!elegiveis.length) return json(200, { status: "acesso_indisponivel" });

  // Uma única conta por CPF: se algum cadastro já tem conta, ela é a referência.
  const comConta = elegiveis.find((c) => c.user_id);
  const userIds = [...new Set(elegiveis.map((c) => c.user_id).filter(Boolean))];
  if (userIds.length > 1) {
    console.error("[auth-primeiro-acesso-cpf] CPF com contas divergentes");
    return json(200, { status: "acesso_indisponivel" });
  }

  if (comConta?.user_id) {
    const { data: sec } = await admin
      .from("auth_user_security_state")
      .select("must_change_password, access_blocked")
      .eq("user_id", comConta.user_id)
      .maybeSingle();
    if (sec?.access_blocked) return json(200, { status: "acesso_indisponivel" });
    if (sec && sec.must_change_password === false) return json(200, { status: "ja_possui_senha" });
  }

  // WhatsApp da ficha (whatsapp > telefone), do cadastro com conta ou do primeiro elegível.
  const ordem = comConta ? [comConta, ...elegiveis.filter((c) => c !== comConta)] : elegiveis;
  let phone: string | null = null;
  for (const c of ordem) {
    phone = normalizeBRPhone(c.whatsapp) ?? normalizeBRPhone(c.telefone);
    if (phone) break;
  }
  if (!phone) return json(200, { status: "sem_whatsapp" });

  // Garante a conta do portal (mesmas regras de dp-criar-acesso-colaborador).
  let userId = comConta?.user_id ?? null;
  const alvo = comConta ?? elegiveis[0];
  if (!userId) {
    const email = `cpf${cpf}@${SYNTHETIC_EMAIL_DOMAIN}`;
    const { data: emUso } = await admin
      .from("dp_colaboradores")
      .select("id")
      .eq("email_portal", email)
      .not("id", "in", `(${elegiveis.map((c) => c.id).join(",")})`)
      .limit(1);
    if (emUso?.length) return json(200, { status: "acesso_indisponivel" });

    const nome = (alvo.nome ?? "").trim().toUpperCase() || null;
    const created = await admin.auth.admin.createUser({
      email,
      password: `${gerarCodigo(20)}aA1!`,
      email_confirm: true,
      user_metadata: { colaborador_id: alvo.id, kind: "dp_colaborador", nome: alvo.nome, full_name: nome },
    });
    if (created.error || !created.data.user) {
      // Conta já existe sem vínculo: falha fechada, nada é vinculado.
      console.error("[auth-primeiro-acesso-cpf] createUser:", created.error?.message);
      return json(200, { status: "acesso_indisponivel" });
    }
    userId = created.data.user.id;

    await admin
      .from("dp_colaboradores")
      .update({ user_id: userId, email_portal: email })
      .in("id", elegiveis.map((c) => c.id))
      .is("user_id", null);
    await admin.from("user_roles").upsert(
      { user_id: userId, role: "dp_colaborador" },
      { onConflict: "user_id,role" },
    );
    if (nome) await admin.from("profiles").update({ full_name: nome }).eq("user_id", userId);
    await admin.from("auth_user_security_state").upsert(
      { user_id: userId, must_change_password: true, access_blocked: false },
      { onConflict: "user_id" },
    );
    await registrarEvento(admin, "access_activation_requested", {
      actorUserId: userId,
      targetUserId: userId,
      companyId: alvo.company_id,
      colaboradorId: alvo.id,
    }).catch(() => {});
  }

  // Desafio compatível com auth-recovery-verify/reset.
  const otp = randomOTP6();
  const challengeToken = randomHex(24);
  const otpHash = await sha256Hex(`${otp}:${challengeToken}`);
  const tokenHash = await sha256Hex(challengeToken);
  const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000).toISOString();

  const { data: inserted, error: insErr } = await admin
    .from("auth_recovery_challenges")
    .insert({
      user_id: userId,
      identifier_hash: await sha256Hex(cpf),
      challenge_token_hash: tokenHash,
      status: "pending_otp",
      expires_at: expiresAt,
      otp_hash: otpHash,
      otp_expires_at: expiresAt,
      otp_sent_at: new Date().toISOString(),
      otp_channel: "whatsapp",
      ip_hash: ipHash,
    })
    .select("id")
    .single();
  if (insErr || !inserted) {
    console.error("[auth-primeiro-acesso-cpf] insert:", insErr?.message);
    return json(500, { error: "Falha ao gerar o código. Tente novamente." });
  }

  const msg = [
    "🔐 *Aveto 360 — Primeiro Acesso ao Portal*",
    "",
    `Seu código de segurança é: *${otp}*`,
    `Ele expira em ${OTP_TTL_SECONDS / 60} minutos.`,
    "",
    "Se você não solicitou, ignore esta mensagem.",
  ].join("\n");

  const st = await checkZapiStatus();
  let delivery = "sent";
  if (!st.connected) {
    delivery = "failed_status";
  } else {
    const send = await sendZapiText(phone, msg);
    delivery = send.ok ? "sent" : "failed_send";
    if (send.messageId) {
      await admin.from("auth_recovery_challenges").update({ whatsapp_message_id: send.messageId }).eq("id", inserted.id);
    }
  }
  await admin.from("auth_recovery_challenges").update({ whatsapp_delivery_status: delivery }).eq("id", inserted.id);

  if (delivery !== "sent") {
    return json(200, { status: "falha_envio" });
  }

  return json(200, {
    status: "enviado",
    challenge_id: inserted.id,
    challenge_token: challengeToken,
    expires_in: OTP_TTL_SECONDS,
    telefone_mascarado: mascararTelefone(phone),
  });
});
