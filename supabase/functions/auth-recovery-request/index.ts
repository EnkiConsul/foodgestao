// Recovery step 1: user provides identifier (email or CPF).
// - Verifies Turnstile
// - Rate limits by identifier hash and IP (auth_rate_limits bucket 'recovery_request')
// - Resolves identifier -> user_id + phone
// - Generates 6-digit OTP + opaque challenge_token, stores hashes in auth_recovery_challenges
// - Sends OTP via Z-API WhatsApp
// - ALWAYS returns { challenge_id, challenge_token, expires_in } to avoid user enumeration.
//   When the identifier is unknown, no Z-API call is made but a decoy row is still created.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "https://esm.sh/zod@3.23.8";
import { sendZapiText, normalizeBRPhone } from "../_shared/zapi.ts";

const BodySchema = z.object({
  identifier: z.string().trim().min(3).max(255),
  turnstile_token: z.string().min(10).max(4096),
});

const OTP_TTL_SECONDS = 600; // 10 minutes
const MAX_PER_IDENTIFIER_PER_HOUR = 3;
const MAX_PER_IP_PER_HOUR = 10;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256Hex(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const d = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return [...arr].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomOTP6(): string {
  // Uniform 6-digit code
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return (arr[0] % 1_000_000).toString().padStart(6, "0");
}

async function verifyTurnstile(token: string, ip: string | null): Promise<boolean> {
  const secret = Deno.env.get("TURNSTILE_SECRET") ?? Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret) return false;
  try {
    const form = new URLSearchParams();
    form.set("secret", secret);
    form.set("response", token);
    if (ip) form.set("remoteip", ip);
    const resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const data = await resp.json();
    return !!data.success;
  } catch {
    return false;
  }
}

/**
 * Increment-and-check rate limit using auth_rate_limits.
 * Uses hourly window; returns true when the caller is currently over the cap.
 */
async function isRateLimited(
  admin: ReturnType<typeof createClient>,
  bucket: string,
  keyHash: string,
  max: number,
): Promise<boolean> {
  const now = new Date();
  const windowStart = new Date(Math.floor(now.getTime() / (60 * 60 * 1000)) * (60 * 60 * 1000)).toISOString();
  // Upsert increment
  const { data: existing } = await admin
    .from("auth_rate_limits")
    .select("count")
    .eq("bucket", bucket)
    .eq("key_hash", keyHash)
    .eq("window_start", windowStart)
    .maybeSingle();
  const nextCount = (existing?.count ?? 0) + 1;
  await admin.from("auth_rate_limits").upsert(
    {
      bucket,
      key_hash: keyHash,
      window_start: windowStart,
      count: nextCount,
      last_seen_at: now.toISOString(),
    },
    { onConflict: "bucket,key_hash,window_start" },
  );
  return nextCount > max;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, service, { auth: { persistSession: false } });

  const ip = req.headers.get("cf-connecting-ip")
    ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? null;

  let body: z.infer<typeof BodySchema>;
  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json(400, { error: "Dados inválidos" });
    body = parsed.data;
  } catch {
    return json(400, { error: "JSON inválido" });
  }

  // 1) Turnstile
  const ok = await verifyTurnstile(body.turnstile_token, ip);
  if (!ok) return json(400, { error: "Verificação de segurança falhou.", code: "captcha_failed" });

  // 2) Rate limit — check IP first so unknown identifiers still count against a single attacker.
  const identifierHash = await sha256Hex(body.identifier.trim().toLowerCase());
  const ipHash = ip ? await sha256Hex(ip) : "no-ip";

  if (await isRateLimited(admin, "recovery_request_ip", ipHash, MAX_PER_IP_PER_HOUR)) {
    return json(429, { error: "Muitas tentativas. Aguarde alguns minutos.", code: "rate_limited" });
  }
  if (await isRateLimited(admin, "recovery_request_id", identifierHash, MAX_PER_IDENTIFIER_PER_HOUR)) {
    return json(429, { error: "Muitas tentativas. Aguarde alguns minutos.", code: "rate_limited" });
  }

  // 3) Resolve identifier -> user (may be null; we still return a decoy)
  const { data: resolved } = await admin.rpc("resolve_login_identifier", { _identifier: body.identifier });
  const resolvedRow = Array.isArray(resolved) ? resolved[0] : resolved;
  const email: string | undefined = resolvedRow?.email;

  let userId: string | null = null;
  let phone: string | null = null;

  if (email) {
    // Find auth user via admin API
    const { data: byEmail } = await admin.auth.admin.listUsers({ page: 1, perPage: 1, email } as any);
    // Fallback path: use rpc-less filter
    let u = byEmail?.users?.find((x: any) => (x.email ?? "").toLowerCase() === email.toLowerCase());
    if (!u) {
      // Alternative: query auth_login_identifiers if the RPC returned it
      const { data: ident } = await admin
        .from("auth_login_identifiers")
        .select("user_id")
        .eq("email", email)
        .maybeSingle();
      if (ident?.user_id) userId = ident.user_id as string;
    } else {
      userId = u.id;
    }

    if (userId) {
      // profiles.phone
      const { data: prof } = await admin
        .from("profiles")
        .select("phone")
        .eq("id", userId)
        .maybeSingle();
      phone = normalizeBRPhone(prof?.phone as string | null);

      // Fallback: dp_colaboradores.whatsapp/telefone by user_id
      if (!phone) {
        const { data: colab } = await admin
          .from("dp_colaboradores")
          .select("whatsapp, telefone")
          .eq("user_id", userId)
          .maybeSingle();
        phone = normalizeBRPhone((colab?.whatsapp as string) ?? (colab?.telefone as string) ?? null);
      }
    }
  }

  // 4) Generate OTP + challenge_token
  const otp = randomOTP6();
  const challengeToken = randomHex(24);
  const otpHash = await sha256Hex(`${otp}:${challengeToken}`);
  const tokenHash = await sha256Hex(challengeToken);
  const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000).toISOString();

  const { data: inserted, error: insertErr } = await admin
    .from("auth_recovery_challenges")
    .insert({
      user_id: userId,
      identifier_hash: identifierHash,
      challenge_token_hash: tokenHash,
      status: userId && phone ? "pending_otp" : "pending_identity", // decoy stays 'pending_identity'
      expires_at: expiresAt,
      otp_hash: userId && phone ? otpHash : null,
      otp_expires_at: userId && phone ? expiresAt : null,
      otp_sent_at: userId && phone ? new Date().toISOString() : null,
      otp_channel: userId && phone ? "whatsapp" : null,
      ip_hash: ipHash,
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    console.error("[auth-recovery-request] insert error:", insertErr?.message);
    return json(500, { error: "Falha ao gerar código. Tente novamente." });
  }

  // 5) Send via Z-API only when a real user/phone is available
  if (userId && phone) {
    const msg = [
      "🔐 *360°FOOD — Recuperação de senha*",
      "",
      `Seu código de verificação é: *${otp}*`,
      `Ele expira em ${Math.floor(OTP_TTL_SECONDS / 60)} minutos.`,
      "",
      "Se você não solicitou, ignore esta mensagem.",
    ].join("\n");
    const send = await sendZapiText(phone, msg);
    if (!send.ok) {
      console.error("[auth-recovery-request] Z-API send failed:", send.error);
      // Do not leak — still respond with same shape.
    } else if (send.messageId) {
      await admin
        .from("auth_recovery_challenges")
        .update({ whatsapp_message_id: send.messageId, whatsapp_delivery_status: "sent" })
        .eq("id", inserted.id);
    }
  }

  // 6) Always the same response shape
  return json(200, {
    challenge_id: inserted.id,
    challenge_token: challengeToken,
    expires_in: OTP_TTL_SECONDS,
    // Never reveal identity or phone. Frontend shows a generic hint.
  });
});
