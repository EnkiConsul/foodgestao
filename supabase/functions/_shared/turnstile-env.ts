/**
 * Ambiente do Cloudflare Turnstile por hostname da origem.
 *
 * O widget de produção só aceita os hostnames cadastrados no painel Cloudflare.
 * Nos domínios de desenvolvimento (preview Lovable e localhost) o widget devolve
 * o erro 110200 e bloqueia o login. Nesses hostnames usamos as chaves de teste
 * oficiais do Cloudflare — a verificação continua acontecendo (siteverify), mas
 * sempre aprova. Produção segue com a chave/segredo reais.
 */

// Chaves de teste públicas do Cloudflare (always passes).
export const TEST_SITE_KEY = "1x00000000000000000000AA";
export const TEST_SECRET_KEY = "1x0000000000000000000000000000000AA";

const DEV_HOST_SUFFIXES = [".lovable.app", ".lovableproject.com", ".lovable.dev"];
const DEV_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

/** Hostname da requisição, a partir do Origin (fallback: Referer). */
export function requestHostname(req: Request): string {
  for (const header of ["origin", "referer"]) {
    const raw = req.headers.get(header);
    if (!raw) continue;
    try {
      return new URL(raw).hostname.toLowerCase();
    } catch {
      // header inválido: tenta o próximo
    }
  }
  return "";
}

/** Hostnames de desenvolvimento/preview — exceto o app publicado da marca. */
export function isDevHostname(hostname: string): boolean {
  const host = (hostname || "").toLowerCase();
  if (!host) return false;
  if (DEV_HOSTS.includes(host)) return true;
  return DEV_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

export type TurnstileMode = "test" | "live";

export function turnstileModeFor(req: Request): TurnstileMode {
  return isDevHostname(requestHostname(req)) ? "test" : "live";
}

/** Segredos a tentar no siteverify, na ordem. */
export function turnstileSecretsFor(req: Request): string[] {
  if (turnstileModeFor(req) === "test") return [TEST_SECRET_KEY];
  return [Deno.env.get("TURNSTILE_SECRET"), Deno.env.get("TURNSTILE_SECRET_KEY")]
    .filter((s): s is string => !!s);
}
