/**
 * Verificação do Cloudflare Turnstile — fonte única para todas as Edge Functions.
 *
 * Regras de segurança:
 *  - O modo (live/test) NUNCA depende de cabeçalho da requisição (Origin/Referer),
 *    porque o cliente controla esses cabeçalhos. O modo vem só da variável de
 *    ambiente TURNSTILE_MODE, definida no servidor.
 *  - A resposta do siteverify é validada por completo: success, hostname na lista
 *    autorizada e action esperada.
 *  - Falha fechada: sem segredo, erro de rede, timeout, HTTP não-2xx ou JSON
 *    inválido resultam em recusa.
 *  - Nada de segredo nem token em log.
 */

// Chaves de teste públicas do Cloudflare (always passes) — usadas só com TURNSTILE_MODE=test.
export const TEST_SITE_KEY = "1x00000000000000000000AA";
export const TEST_SECRET_KEY = "1x0000000000000000000000000000000AA";

/** Site key de produção do widget ativo (valor publicável). */
export const DEFAULT_SITE_KEY = "0x4AAAAAAD8NercrKUKyuZHo";

/** Action declarada pelo widget no front-end. */
export const TURNSTILE_ACTION = "turnstile-spin-v2";

const DEFAULT_ALLOWED_HOSTNAMES = ["aveto360.com", "www.aveto360.com"];

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const SITEVERIFY_TIMEOUT_MS = 8000;

export type TurnstileMode = "test" | "live";

export type TurnstileFailureReason =
  | "missing_token"
  | "missing_secret"
  | "verify_unavailable"
  | "invalid_token"
  | "hostname_not_allowed"
  | "action_mismatch";

export type TurnstileResult =
  | { ok: true; mode: TurnstileMode }
  | { ok: false; mode: TurnstileMode; reason: TurnstileFailureReason };

function env(name: string): string | undefined {
  const runtime = (globalThis as { Deno?: { env: { get(key: string): string | undefined } } }).Deno;
  const value = runtime?.env?.get(name);
  return value && value.trim() ? value.trim() : undefined;
}

/** Modo do Turnstile — decidido apenas no servidor. Padrão: live. */
export function turnstileMode(): TurnstileMode {
  return env("TURNSTILE_MODE")?.toLowerCase() === "test" ? "test" : "live";
}

/** Site key a entregar ao front-end. */
export function turnstileSiteKey(): string {
  if (turnstileMode() === "test") return TEST_SITE_KEY;
  return env("TURNSTILE_SITE_KEY") ?? DEFAULT_SITE_KEY;
}

/** Segredos a tentar no siteverify, na ordem (widget atual + legado). */
export function turnstileSecrets(): string[] {
  if (turnstileMode() === "test") return [TEST_SECRET_KEY];
  const secrets = [env("TURNSTILE_SECRET"), env("TURNSTILE_SECRET_KEY")]
    .filter((s): s is string => !!s);
  return [...new Set(secrets)];
}

/** Hostnames aceitos na resposta do siteverify. */
export function allowedHostnames(): string[] {
  const raw = env("TURNSTILE_ALLOWED_HOSTNAMES");
  const list = (raw ? raw.split(",") : DEFAULT_ALLOWED_HOSTNAMES)
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return list.length > 0 ? list : DEFAULT_ALLOWED_HOSTNAMES;
}

function hostnameAllowed(hostname: unknown): boolean {
  if (typeof hostname !== "string" || !hostname.trim()) return false;
  return allowedHostnames().includes(hostname.trim().toLowerCase());
}

async function siteverify(
  secret: string,
  token: string,
  ip: string | null,
): Promise<Record<string, unknown> | null> {
  const form = new URLSearchParams();
  form.set("secret", secret);
  form.set("response", token);
  if (ip) form.set("remoteip", ip);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SITEVERIFY_TIMEOUT_MS);
  try {
    const resp = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      signal: controller.signal,
    });
    if (!resp.ok) {
      console.warn(`[turnstile] siteverify HTTP ${resp.status}`);
      return null;
    }
    const data = await resp.json();
    if (!data || typeof data !== "object") {
      console.warn("[turnstile] siteverify devolveu corpo inesperado");
      return null;
    }
    return data as Record<string, unknown>;
  } catch (e) {
    console.warn(`[turnstile] siteverify indisponível: ${e instanceof Error ? e.name : "erro"}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Verifica o token do desafio. Falha fechada em qualquer dúvida.
 * `expectedAction` padrão é a action do widget do produto.
 */
export async function verifyTurnstileToken(params: {
  token: string | null | undefined;
  ip?: string | null;
  expectedAction?: string | null;
  contexto?: string;
}): Promise<TurnstileResult> {
  const mode = turnstileMode();
  const ctx = params.contexto ?? "geral";
  const token = typeof params.token === "string" ? params.token.trim() : "";
  if (token.length < 10 || token.length > 2048) {
    console.warn(`[turnstile:${ctx}] token ausente ou fora do tamanho permitido`);
    return { ok: false, mode, reason: "missing_token" };
  }

  const secrets = turnstileSecrets();
  if (secrets.length === 0) {
    console.error(`[turnstile:${ctx}] TURNSTILE_SECRET não configurado`);
    return { ok: false, mode, reason: "missing_secret" };
  }

  const expectedAction =
    params.expectedAction === null ? null : (params.expectedAction ?? TURNSTILE_ACTION);

  let reason: TurnstileFailureReason = "verify_unavailable";
  let reachedCloudflare = false;

  for (const secret of secrets) {
    const data = await siteverify(secret, token, params.ip ?? null);
    if (!data) continue;
    reachedCloudflare = true;

    if (data.success !== true) {
      console.warn(`[turnstile] recusado: ${JSON.stringify(data["error-codes"] ?? [])}`);
      reason = "invalid_token";
      continue;
    }

    // Em modo de teste o Cloudflare não devolve hostname/action reais do produto.
    if (mode === "live") {
      if (!hostnameAllowed(data.hostname)) {
        console.warn("[turnstile] hostname fora da lista autorizada");
        return { ok: false, mode, reason: "hostname_not_allowed" };
      }
      if (expectedAction && data.action !== expectedAction) {
        console.warn("[turnstile] action divergente do esperado");
        return { ok: false, mode, reason: "action_mismatch" };
      }
    }

    return { ok: true, mode };
  }

  if (!reachedCloudflare) reason = "verify_unavailable";
  return { ok: false, mode, reason };
}
