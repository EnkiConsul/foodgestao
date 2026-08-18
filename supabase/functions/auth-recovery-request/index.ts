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
import { checkZapiStatus, sendZapiText, normalizeBRPhone } from "../_shared/zapi.ts";

const BodySchema = z.object({
  identifier: z.string().trim().min(3).max(255),
  turnstile_token: z.string().min(10).max(4096),
});

const OTP_TTL_SECONDS = 600; // 10 minutes
const MAX_PER_IDENTIFIER_PER_HOUR = 3;
const MAX_PER_IP_PER_HOUR = 10;
type PhoneSource = "profiles.phone" | "dp_colaboradores.whatsapp" | "dp_colaboradores.telefone";

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
  const secrets = [Deno.env.get("TURNSTILE_SECRET"), Deno.env.get("TURNSTILE_SECRET_KEY")]
    .filter((s): s is string => !!s);
  const seen = new Set<string>();
  for (const secret of secrets) {
    if (seen.has(secret)) continue;
    seen.add(secret);
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
      if (data.success) return true;
      console.warn("[auth-recovery-request] Turnstile verify failed:", data["error-codes"]);
    } catch (e) {
      console.error("[auth-recovery-request] Turnstile verify exception:", e);
    }
  }
  return false;
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

function countDigits(value: string | null | undefined): number {
  return value?.replace(/\D+/g, "").length ?? 0;
}

function deliveryFailureStatus(error: string | undefined, httpStatus?: number): string {
  if (typeof httpStatus === "number") return `failed_http_${httpStatus}`;
  if (!error) return "failed_unknown";
  if (/^[a-z0-9_\-]+$/i.test(error)) return `failed_${error}`.slice(0, 64);
  return "failed_zapi_error";
}

async function updateDeliveryStatus(
  admin: ReturnType<typeof createClient>,
  challengeId: string,
  status: string,
  messageId?: string,
) {
  const payload: Record<string, string> = { whatsapp_delivery_status: status };
  if (messageId) payload.whatsapp_message_id = messageId;
  await admin.from("auth_recovery_challenges").update(payload).eq("id", challengeId);
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

  let userId: string | null = (resolvedRow?.user_id as string | undefined) ?? null;
  let phone: string | null = null;
  let phoneSource: PhoneSource | null = null;
  let rawPhoneDigitCount = 0;

  if (userId) {
    // profiles.phone (filter by user_id, not id)
    const { data: prof } = await admin
      .from("profiles")
      .select("phone")
      .eq("user_id", userId)
      .maybeSingle();
    const profilePhone = prof?.phone as string | null;
    phone = normalizeBRPhone(profilePhone);
    if (phone) {
      phoneSource = "profiles.phone";
      rawPhoneDigitCount = countDigits(profilePhone);
    }

    // Fallback: dp_colaboradores.whatsapp/telefone by user_id
    if (!phone) {
      const { data: colab } = await admin
        .from("dp_colaboradores")
        .select("whatsapp, telefone")
        .eq("user_id", userId)
        .maybeSingle();
      const whatsapp = colab?.whatsapp as string | null;
      phone = normalizeBRPhone(whatsapp);
      if (phone) {
        phoneSource = "dp_colaboradores.whatsapp";
        rawPhoneDigitCount = countDigits(whatsapp);
      }

      if (!phone) {
        const telefone = colab?.telefone as string | null;
        phone = normalizeBRPhone(telefone);
        if (phone) {
          phoneSource = "dp_colaboradores.telefone";
          rawPhoneDigitCount = countDigits(telefone);
        }
      }
    }
  }

  console.info("[auth-recovery-request] identity lookup", {
    has_user: Boolean(userId),
    has_valid_phone: Boolean(phone),
    phone_source: phoneSource,
    raw_phone_digit_count: rawPhoneDigitCount,
    normalized_digit_count: phone?.length ?? 0,
  });

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

  if (userId && !phone) {
    await updateDeliveryStatus(admin, inserted.id, "no_valid_phone");
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

    const status = await checkZapiStatus();
    if (!status.connected) {
      const failure = deliveryFailureStatus(status.error, status.httpStatus);
      console.error("[auth-recovery-request] Z-API status failed:", failure);
      await updateDeliveryStatus(admin, inserted.id, failure);
      return json(200, {
        challenge_id: inserted.id,
        challenge_token: challengeToken,
        expires_in: OTP_TTL_SECONDS,
      });
    }

    const send = await sendZapiText(phone, msg);
    if (!send.ok) {
      const failure = deliveryFailureStatus(send.error, send.httpStatus);
      console.error("[auth-recovery-request] Z-API send failed:", failure);
      await updateDeliveryStatus(admin, inserted.id, failure);
      // Do not leak — still respond with same shape.
    } else if (send.messageId) {
      await updateDeliveryStatus(admin, inserted.id, "sent", send.messageId);
    } else {
      await updateDeliveryStatus(admin, inserted.id, "sent_no_message_id");
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
