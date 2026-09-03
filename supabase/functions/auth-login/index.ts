// Unified login: accepts identifier (email OR CPF) + password + Cloudflare Turnstile token.
// Verifies Turnstile, enforces persistent rate limit, resolves identifier to a real email
// (CPF -> synthetic email), signs in via Supabase, and returns the session tokens plus a
// flag indicating whether the user must change password on first access.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "https://esm.sh/zod@3.23.8";
import { turnstileSecretsFor } from "../_shared/turnstile-env.ts";

const BodySchema = z.object({
  identifier: z.string().trim().min(3).max(255),
  password: z.string().min(1).max(256),
  turnstile_token: z.string().min(10).max(4096),
});

const GENERIC_ERROR = "Credenciais inválidas. Tente novamente.";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function verifyWithSecret(secret: string, token: string, ip: string | null) {
  const form = new URLSearchParams();
  form.set("secret", secret);
  form.set("response", token);
  if (ip) form.set("remoteip", ip);
  const resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  return await resp.json();
}

async function verifyTurnstile(req: Request, token: string, ip: string | null): Promise<boolean> {
  // Two secrets may be configured (legacy + current widget). Try each one so a
  // mismatch between site key and secret does not lock everyone out.
  const secrets = turnstileSecretsFor(req);
  if (secrets.length === 0) {
    console.error("[auth-login] TURNSTILE_SECRET not configured");
    return false;
  }
  const seen = new Set<string>();
  for (const secret of secrets) {
    if (seen.has(secret)) continue;
    seen.add(secret);
    try {
      const data = await verifyWithSecret(secret, token, ip);
      if (data.success) return true;
      console.warn("[auth-login] Turnstile verify failed:", data["error-codes"]);
    } catch (e) {
      console.error("[auth-login] Turnstile verify exception:", e);
    }
  }
  return false;
}


async function sha256(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
  const captchaOk = await verifyTurnstile(req, body.turnstile_token, ip);
  if (!captchaOk) return json(400, { error: "Verificação de segurança falhou. Recarregue e tente novamente.", code: "captcha_failed" });

  const admin = createClient(url, service, { auth: { persistSession: false } });

  const identifierHash = await sha256(body.identifier.trim().toLowerCase());

  // 2) Pre-check rate limit (with a no-op read: try recording a failure only after we know result;
  // but if bucket already >= max, short-circuit). We do a probe by attempting a "success=true"
  // record which doesn't increment.
  {
    const { data: probe } = await admin.rpc("record_login_attempt", {
      _identifier_hash: identifierHash,
      _ip: ip,
      _success: true,
    });
    const row = Array.isArray(probe) ? probe[0] : probe;
    if (row?.blocked) {
      return json(429, {
        error: `Muitas tentativas. Tente novamente em ${Math.ceil((row.retry_after_seconds ?? 60) / 60)} minuto(s).`,
        code: "rate_limited",
        retry_after_seconds: row.retry_after_seconds,
      });
    }
  }

  // 3) Resolve identifier
  const { data: resolved } = await admin.rpc("resolve_login_identifier", { _identifier: body.identifier });
  const resolvedRow = Array.isArray(resolved) ? resolved[0] : resolved;
  const emailToUse: string | undefined = resolvedRow?.email;

  // 4) Attempt sign in (via anon client so we don't bypass password verification).
  // If identifier could not be resolved, we still fake a delay to reduce enumeration.
  const anonClient = createClient(url, anon, { auth: { persistSession: false } });
  let signInError: string | null = null;
  let sessionPayload: { access_token: string; refresh_token: string; user_id: string } | null = null;

  if (emailToUse) {
    const { data, error } = await anonClient.auth.signInWithPassword({
      email: emailToUse,
      password: body.password,
    });
    if (error || !data?.session) {
      signInError = error?.message ?? "invalid_credentials";
    } else {
      sessionPayload = {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        user_id: data.user!.id,
      };
    }
  } else {
    // Unknown identifier: keep response time similar
    await new Promise((r) => setTimeout(r, 250));
    signInError = "unknown_identifier";
  }

  // 5) Record attempt
  await admin.rpc("record_login_attempt", {
    _identifier_hash: identifierHash,
    _ip: ip,
    _success: !!sessionPayload,
  });

  if (!sessionPayload) {
    console.log(`[auth-login] fail: ${signInError} (source=${resolvedRow?.source ?? "none"})`);
    return json(401, { error: GENERIC_ERROR, code: "invalid_credentials" });
  }

  // 6) Password-change-required flag
  const { data: mustChange } = await admin.rpc("get_password_change_required", {
    _user_id: sessionPayload.user_id,
  });

  return json(200, {
    session: {
      access_token: sessionPayload.access_token,
      refresh_token: sessionPayload.refresh_token,
    },
    user_id: sessionPayload.user_id,
    password_change_required: !!mustChange,
    identifier_source: resolvedRow?.source ?? "email",
  });
});
