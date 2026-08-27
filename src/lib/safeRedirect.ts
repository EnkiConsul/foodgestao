/**
 * Validação do parâmetro `redirect` usado após o login.
 *
 * Regra de segurança: só aceitamos caminhos internos (same-origin).
 * Qualquer URL absoluta, protocol-relative (`//evil.com`), com esquema
 * (`http:`, `javascript:`, `data:`) ou com truques de barra invertida
 * (`/\evil.com`) é descartada e cai no destino padrão.
 */
export const DEFAULT_REDIRECT = "/hub";

/** Rotas que nunca devem ser destino de redirect (evita loop de login). */
const BLOCKED_PREFIXES = ["/auth", "/reset-password"];

/**
 * Remove caracteres de controle (U+0000–U+001F e U+007F) por ponto de código.
 * Evitamos regex com literais de controle — a checagem por código é explícita
 * e não depende de escapes difíceis de auditar.
 */
function stripControlChars(input: string): string {
  let out = "";
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    if (code <= 0x1f || code === 0x7f) continue;
    out += ch;
  }
  return out;
}

export function sanitizeRedirect(
  raw: string | null | undefined,
  fallback: string = DEFAULT_REDIRECT,
): string {
  if (typeof raw !== "string") return fallback;

  // Remove espaços/controles que browsers ignoram ao resolver URLs
  // (ex.: "\n\thttp://evil.com" ou "/ /evil.com").
  let value = stripControlChars(raw.trim());
  if (!value) return fallback;

  // Alguns fluxos chegam com o valor codificado mais de uma vez.
  for (let i = 0; i < 2; i++) {
    if (!/%[0-9a-fA-F]{2}/.test(value)) break;
    try {
      const decoded = decodeURIComponent(value);
      if (decoded === value) break;
      value = stripControlChars(decoded.trim());
    } catch {
      return fallback;
    }
  }
  if (!value) return fallback;

  // Normaliza backslashes: browsers os tratam como "/" em URLs.
  const normalized = value.replace(/\\/g, "/");

  // Precisa ser um caminho absoluto interno.
  if (!normalized.startsWith("/")) return fallback;
  // "//host" e "/\host" viram origem externa.
  if (normalized.startsWith("//")) return fallback;
  // Esquema explícito em qualquer lugar antes do primeiro "/" já foi coberto,
  // mas bloqueamos também "/javascript:..." e similares por segurança.
  if (/^\/+[a-z][a-z0-9+.-]*:/i.test(normalized)) return fallback;

  // Valida contra a própria origem — pega qualquer caso residual.
  let url: URL;
  try {
    const origin =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : "http://localhost";
    url = new URL(normalized, origin);
    if (url.origin !== origin) return fallback;
  } catch {
    return fallback;
  }

  const path = `${url.pathname}${url.search}${url.hash}`;
  if (path === "/" || !path.startsWith("/")) return fallback;
  if (BLOCKED_PREFIXES.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`))) {
    return fallback;
  }

  return path;
}
