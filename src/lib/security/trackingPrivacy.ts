/**
 * Privacidade de rastreamento (AUD-021).
 *
 * Fonte única em TypeScript das regras que decidem se uma navegação pode ser
 * reportada a ferramentas de análise, e de como a URL é reduzida antes de sair
 * do navegador. Espelhado em `public/scripts/tracking-privacy.js`, que roda no
 * bootstrap (antes do React) — o teste `trackingPrivacy.test.ts` garante que as
 * duas listas continuem idênticas.
 *
 * Nada aqui envia dados: são apenas decisões e sanitização.
 */

/** Rotas onde nenhum tracker pode registrar nada. */
export const SENSITIVE_PREFIXES = [
  "/auth",
  "/login",
  "/dp/login",
  "/primeiro-acesso",
  "/ativar-acesso",
  "/redefinir-acesso",
  "/esqueci-senha",
  "/reset-password",
  "/redefinir-senha",
  "/convite",
  "/aceitar-convite",
  "/oauth",
  "/.lovable/oauth",
] as const;

/** Parâmetros que podem carregar credencial temporária ou dado pessoal. */
export const SENSITIVE_PARAMS = [
  "t",
  "c",
  "token",
  "token_hash",
  "code",
  "access_token",
  "refresh_token",
  "id_token",
  "provider_token",
  "invite",
  "invite_token",
  "confirmation_token",
  "recovery_token",
  "otp",
  "email",
  "cpf",
  "authorization_id",
  "redirect",
  "type",
  "apikey",
  "key",
  "secret",
  "password",
  "senha",
] as const;

/** Allowlist estrita: só estes parâmetros acompanham o caminho. */
export const ALLOWED_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "gclid",
  "fbclid",
  "plano",
] as const;

function normalizarCaminho(pathname: string | undefined): string {
  let p = String(pathname || "/");
  if (!p.startsWith("/")) p = `/${p}`;
  return p.toLowerCase();
}

export function isSensitivePath(pathname: string | undefined): boolean {
  const p = normalizarCaminho(pathname);
  return SENSITIVE_PREFIXES.some((pref) => p === pref || p.startsWith(`${pref}/`));
}

function chavesDe(texto: string | undefined): string[] {
  const bruto = String(texto || "").replace(/^[?#]/, "");
  if (!bruto) return [];
  return bruto
    .split(/[&;]/)
    .filter(Boolean)
    .map((parte) => {
      const chave = parte.split("=")[0] ?? "";
      try {
        return decodeURIComponent(chave).trim().toLowerCase();
      } catch {
        return chave.trim().toLowerCase();
      }
    });
}

export function hasSensitiveParams(search?: string, hash?: string): boolean {
  const chaves = [...chavesDe(search), ...chavesDe(hash)];
  return chaves.some((chave) => {
    if (!chave) return false;
    if ((SENSITIVE_PARAMS as readonly string[]).includes(chave)) return true;
    if ((ALLOWED_PARAMS as readonly string[]).includes(chave)) return false;
    return /token|code|secret|senha|password|auth/.test(chave);
  });
}

/** Verdadeiro quando NENHUM tracker pode reportar esta navegação. */
export function isSensitiveLocation(pathname?: string, search?: string, hash?: string): boolean {
  return isSensitivePath(pathname) || hasSensitiveParams(search, hash);
}

/** Caminho + apenas parâmetros de campanha; nunca fragmento. */
export function sanitizePath(pathname?: string, search?: string): string {
  const caminho = normalizarCaminho(pathname);
  const bruto = String(search || "").replace(/^\?/, "");
  if (!bruto) return caminho;
  const mantidos = bruto
    .split("&")
    .filter(Boolean)
    .map((parte) => parte.split("="))
    .filter(([chave]) => (ALLOWED_PARAMS as readonly string[]).includes((chave ?? "").toLowerCase()))
    .map(([chave, valor]) => `${(chave ?? "").toLowerCase()}=${valor ?? ""}`);
  return mantidos.length ? `${caminho}?${mantidos.join("&")}` : caminho;
}

/** URL absoluta sanitizada (mesma origem), sem fragmento nem segredos. */
export function sanitizeUrl(origin: string, pathname?: string, search?: string): string {
  return `${origin || ""}${sanitizePath(pathname, search)}`;
}

/** Referrer reduzido: "internal" na mesma origem, origem externa ou "direct". */
export function safeReferrer(referrer?: string, origin?: string): string {
  const bruto = String(referrer || "");
  if (!bruto) return "direct";
  try {
    const u = new URL(bruto);
    if (origin && u.origin === origin) return "internal";
    return u.origin;
  } catch {
    return "direct";
  }
}

/** Decide pela URL atual do navegador (sem tocar em estado da aplicação). */
export function currentLocationIsSensitive(): boolean {
  if (typeof window === "undefined") return true;
  const { pathname, search, hash } = window.location;
  return isSensitiveLocation(pathname, search, hash);
}
