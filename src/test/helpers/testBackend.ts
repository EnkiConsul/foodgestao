/**
 * Backend usado pelos testes reais de RLS/tenancy — SOMENTE homologação.
 *
 * - Lê exclusivamente TEST_SUPABASE_URL / TEST_SUPABASE_ANON_KEY.
 * - Nunca usa VITE_SUPABASE_URL nem qualquer fallback para produção.
 * - Valida que URL e chave pertencem ao projeto de homologação autorizado
 *   antes de qualquer acesso de rede.
 * - Sem ambiente válido: os testes ficam NÃO EXECUTADOS (aviso explícito).
 * - Com TEST_BACKEND_REQUIRED=1 (Release Gate): ausência, divergência ou
 *   backend inacessível viram falha — nunca aprovação.
 */
export const HOMOLOGACAO_REF = "utjhzpdbqzajrhnzcher";
export const PRODUCAO_REF = "grtxmbffgmgnkawlvqhm";

/** Endereço inválido (RFC 2606) — garante que nada sai para a rede. */
const UNCONFIGURED_URL = "https://backend-de-teste-nao-configurado.invalid";

export interface TestBackend {
  url: string;
  anonKey: string;
  configured: boolean;
  reason: string | null;
}

function decodeRef(jwt: string): string | null {
  try {
    const payload = jwt.split(".")[1];
    const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof json.ref === "string" ? json.ref : null;
  } catch {
    return null;
  }
}

export function resolveTestBackend(env: Record<string, string | undefined>): TestBackend {
  const url = (env.TEST_SUPABASE_URL ?? "").trim();
  const key = (env.TEST_SUPABASE_ANON_KEY ?? "").trim();
  const fail = (reason: string): TestBackend => ({
    url: UNCONFIGURED_URL,
    anonKey: "nao-configurado",
    configured: false,
    reason,
  });
  if (!url || !key) return fail("TEST_SUPABASE_URL/TEST_SUPABASE_ANON_KEY ausentes");
  if (url.includes(PRODUCAO_REF) || key.includes(PRODUCAO_REF) || decodeRef(key) === PRODUCAO_REF)
    return fail("configuração aponta para PRODUÇÃO — bloqueado");
  if (url.replace(/\/+$/, "") !== `https://${HOMOLOGACAO_REF}.supabase.co`)
    return fail("TEST_SUPABASE_URL não é o projeto de homologação autorizado");
  if (decodeRef(key) !== HOMOLOGACAO_REF)
    return fail("TEST_SUPABASE_ANON_KEY não pertence ao projeto de homologação");
  return { url: `https://${HOMOLOGACAO_REF}.supabase.co`, anonKey: key, configured: true, reason: null };
}

export const TEST_BACKEND_REQUIRED = process.env.TEST_BACKEND_REQUIRED === "1";

const backend = resolveTestBackend(process.env);

if (!backend.configured) {
  if (TEST_BACKEND_REQUIRED) {
    throw new Error(`[testBackend] modo obrigatório: ${backend.reason}. Testes reais não podem ser aprovados.`);
  }
  // eslint-disable-next-line no-console
  console.warn(`[testBackend] NÃO EXECUTADO: ${backend.reason} — testes reais de RLS ignorados.`);
}

export const SUPABASE_URL = backend.url;
export const ANON_KEY = backend.anonKey;
export const TEST_BACKEND_CONFIGURED = backend.configured;

/** Health check; em modo obrigatório, backend inacessível lança erro. */
export async function checkTestBackend(): Promise<boolean> {
  if (!backend.configured) return false;
  let ok = false;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, { headers: { apikey: ANON_KEY } });
    ok = res.ok;
  } catch {
    ok = false;
  }
  if (!ok && TEST_BACKEND_REQUIRED) {
    throw new Error("[testBackend] modo obrigatório: backend de homologação inacessível.");
  }
  return ok;
}

/** Para testes com health check próprio: em modo obrigatório, indisponível = falha. */
export function failIfRequired(available: boolean): void {
  if (!available && TEST_BACKEND_REQUIRED) {
    throw new Error("[testBackend] modo obrigatório: backend de homologação inacessível ou não configurado.");
  }
}
