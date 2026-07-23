// Recovery step 2: verify the 6-digit OTP.
// On success, mints a reset_token (single-use, 10min) tied to the challenge.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "https://esm.sh/zod@3.23.8";
import { timingSafeEqualHex } from "../_shared/zapi.ts";

const BodySchema = z.object({
  challenge_id: z.string().uuid(),
  challenge_token: z.string().min(32).max(128),
  otp: z.string().regex(/^\d{6}$/, "OTP inválido"),
});

const RESET_TTL_SECONDS = 600;
const MAX_ATTEMPTS = 5;

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, service, { auth: { persistSession: false } });

  let body: z.infer<typeof BodySchema>;
  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json(400, { error: "Dados inválidos" });
    body = parsed.data;
  } catch {
    return json(400, { error: "JSON inválido" });
  }

  const { data: row } = await admin
    .from("auth_recovery_challenges")
    .select("id, user_id, status, otp_hash, otp_expires_at, otp_attempt_count, challenge_token_hash")
    .eq("id", body.challenge_id)
    .maybeSingle();

  const generic = () => json(400, { error: "Código inválido ou expirado.", code: "invalid_otp" });
  if (!row) return generic();

  // Terminal states short-circuit
  if (row.status === "completed" || row.status === "expired" || row.status === "blocked") return generic();

  // Validate challenge_token
  const tokenHash = await sha256Hex(body.challenge_token);
  if (!timingSafeEqualHex(tokenHash, row.challenge_token_hash ?? "")) return generic();

  // Expired?
  if (!row.otp_expires_at || new Date(row.otp_expires_at).getTime() < Date.now()) {
    await admin.from("auth_recovery_challenges").update({ status: "expired" }).eq("id", row.id);
    return generic();
  }

  // Too many attempts?
  if ((row.otp_attempt_count ?? 0) >= MAX_ATTEMPTS) {
    await admin.from("auth_recovery_challenges").update({ status: "blocked" }).eq("id", row.id);
    return json(429, { error: "Muitas tentativas. Solicite um novo código.", code: "too_many_attempts" });
  }

  // Compare OTP hash (hash uses otp + challenge_token as salt)
  const otpHash = await sha256Hex(`${body.otp}:${body.challenge_token}`);
  const match = !!row.otp_hash && timingSafeEqualHex(otpHash, row.otp_hash);

  if (!match || !row.user_id) {
    await admin
      .from("auth_recovery_challenges")
      .update({ otp_attempt_count: (row.otp_attempt_count ?? 0) + 1 })
      .eq("id", row.id);
    return generic();
  }

  // Success — issue reset_token
  const resetToken = randomHex(32);
  const resetTokenHash = await sha256Hex(resetToken);
  const resetExpires = new Date(Date.now() + RESET_TTL_SECONDS * 1000).toISOString();

  await admin
    .from("auth_recovery_challenges")
    .update({
      status: "verified",
      otp_verified_at: new Date().toISOString(),
      reset_token_hash: resetTokenHash,
      reset_token_expires_at: resetExpires,
    })
    .eq("id", row.id);

  return json(200, { reset_token: resetToken, expires_in: RESET_TTL_SECONDS });
});
