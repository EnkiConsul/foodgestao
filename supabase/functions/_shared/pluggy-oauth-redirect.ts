// Hosts permitidos para oauthRedirectUri do widget Pluggy.
// Lista vem de PLUGGY_OAUTH_REDIRECT_HOSTS (separada por vírgula). Sem a
// variável, vale só produção + preview do projeto. Sem curingas.
export const DEFAULT_OAUTH_REDIRECT_HOSTS = [
  'aveto360.com',
  'www.aveto360.com',
  'aveto360.lovable.app',
  'id-preview--ceeb4a17-6191-46b0-a351-c97a8211c03e.lovable.app',
];

export function parseAllowedHosts(env: string | undefined | null): Set<string> {
  const list = (env ?? '').split(',').map((h) => h.trim().toLowerCase()).filter((h) => h && !h.includes('*'));
  return new Set(list.length ? list : DEFAULT_OAUTH_REDIRECT_HOSTS);
}

export function isAllowedOauthRedirectUri(value: unknown, allowed: Set<string>): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    if (url.username || url.password || url.hash) return false;
    return allowed.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}
