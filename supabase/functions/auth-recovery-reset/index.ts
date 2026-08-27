// Recovery step 3: consume reset_token and set a new password via admin API.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "https://esm.sh/zod@3.23.8";

const BodySchema = z.object({
  challenge_id: z.string().uuid(),
  reset_token: z.string().min(32).max(128),
  new_password: z.string().min(12).max(128),
});

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

function isStrongPassword(pw: string): boolean {
  if (pw.length < 12) return false;
  const hasLower = /[a-z]/.test(pw);
  const hasUpper = /[A-Z]/.test(pw);
  const hasDigit = /\d/.test(pw);
  const hasSymbol = /[^A-Za-z0-9]/.test(pw);
  return hasLower && hasUpper && hasDigit && hasSymbol;
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

  if (!isStrongPassword(body.new_password)) {
    return json(400, {
      error: "A senha deve ter no mínimo 12 caracteres, com maiúscula, minúscula, número e símbolo.",
      code: "weak_password",
    });
  }

  const invalid = () =>
    json(400, { error: "Sessão de recuperação inválida ou expirada.", code: "invalid_reset" });

  const providedHash = await sha256Hex(body.reset_token);

  // Atomic single-use consumption: the challenge is claimed (status -> completed and
  // reset token cleared) in one conditional UPDATE. Concurrent replays get null.
  const { data: claimedUserId, error: claimErr } = await admin.rpc("consume_recovery_reset", {
    p_challenge_id: body.challenge_id,
    p_reset_token_hash: providedHash,
  });

  if (claimErr) {
    console.error("[auth-recovery-reset] claim error:", claimErr.message);
    return json(500, { error: "Não foi possível redefinir sua senha. Tente novamente." });
  }
  if (!claimedUserId) return invalid();

  // Update password via admin API — only after the token was consumed.
  const { error: updErr } = await admin.auth.admin.updateUserById(claimedUserId as string, {
    password: body.new_password,
  });
  if (updErr) {
    console.error("[auth-recovery-reset] update error:", updErr.message);
    // The token is already consumed; make sure the challenge can never be reused.
    await admin.rpc("fail_recovery_reset", { p_challenge_id: body.challenge_id });
    return json(500, {
      error: "Não foi possível redefinir sua senha. Solicite um novo código.",
      code: "reset_failed",
    });
  }

  // Clear first-access / password_change_required flag
  const { error: finErr } = await admin.rpc("finalize_recovery_reset", {
    p_user_id: claimedUserId as string,
  });
  if (finErr) console.error("[auth-recovery-reset] finalize warning:", finErr.message);

  return json(200, { ok: true });
});
