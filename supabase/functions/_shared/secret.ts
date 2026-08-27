/**
 * Comparação de segredos em tempo constante.
 *
 * Regra do projeto: segredo de webhook/cron é aceito SOMENTE por cabeçalho.
 * Query string (`?secret=`) vaza em log de acesso, histórico e referer.
 */
export function secretMatches(
  provided: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (!expected || !provided) return false;
  const a = new TextEncoder().encode(provided);
  const b = new TextEncoder().encode(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
