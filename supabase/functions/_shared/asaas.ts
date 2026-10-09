// Shared Asaas API helper
//
// O ambiente (produção/sandbox) vem SEMPRE do campo `asaas_env` do registro
// operado (billing_accounts/subscriptions/invoices), nunca do navegador.
export type AsaasEnv = "production" | "sandbox";

export function parseAsaasEnv(v: unknown): AsaasEnv {
  return v === "sandbox" ? "sandbox" : "production";
}

function normalizeBaseUrl(raw: string | undefined, fallback: string): string {
  let url = (raw ?? "").trim().replace(/\/+$/, "");
  if (!url) return fallback;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  // Aceita "https://api.asaas.com" ou ".../api" e completa a versão
  if (!/\/v3$/i.test(url)) url = `${url}/v3`;
  return url;
}

function credenciais(env: AsaasEnv): { url: string; key: string; nomeKey: string } {
  if (env === "sandbox") {
    const url = normalizeBaseUrl(Deno.env.get("ASAAS_SANDBOX_API_URL"), "https://api-sandbox.asaas.com/v3");
    if (!/sandbox/i.test(url)) throw new Error("ASAAS_SANDBOX_API_URL não aponta para o Sandbox do Asaas");
    return { url, key: (Deno.env.get("ASAAS_SANDBOX_API_KEY") ?? "").trim(), nomeKey: "ASAAS_SANDBOX_API_KEY" };
  }
  const url = normalizeBaseUrl(Deno.env.get("ASAAS_API_URL"), "https://api.asaas.com/v3");
  return { url, key: (Deno.env.get("ASAAS_API_KEY") ?? "").trim(), nomeKey: "ASAAS_API_KEY" };
}

export async function asaasFetch(path: string, init: RequestInit = {}, env: AsaasEnv = "production") {
  const { url: base, key, nomeKey } = credenciais(env);
  if (!key) throw new Error(`${nomeKey} not configured`);
  const url = `${base}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "access_token": key,
      "User-Agent": "Aveto360/1.0",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let data: any = null;
  let isJson = true;
  try { data = text ? JSON.parse(text) : null; } catch { isJson = false; data = { raw: text }; }
  if (!res.ok) {
    const msg = data?.errors?.[0]?.description ?? (isJson ? `HTTP ${res.status}` : `HTTP ${res.status} (resposta não-JSON)`);
    console.error(`Asaas[${env}] ${init.method ?? "GET"} ${path} falhou [${res.status}]`, isJson ? JSON.stringify(data).slice(0, 500) : text.slice(0, 200));
    throw new Error(`Asaas ${path} [${res.status}]: ${msg}`);
  }
  if (!isJson) {
    console.error(`Asaas[${env}] ${path} respondeu não-JSON:`, text.slice(0, 200));
    throw new Error(`Asaas respondeu em formato inesperado — verifique o endereço da API.`);
  }
  return data;
}

/** Exige que a resposta do Asaas traga um id; senão aborta com erro claro. */
export function requireAsaasId(obj: any, what: string): string {
  const id = obj?.id;
  if (!id || typeof id !== "string") {
    console.error(`Asaas sem id em ${what}:`, JSON.stringify(obj ?? null).slice(0, 500));
    throw new Error(`O Asaas não confirmou a criação de ${what}. Nenhuma cobrança foi gerada; verifique a chave e o endereço da API.`);
  }
  return id;
}

export type AsaasBillingType = "PIX" | "BOLETO" | "CREDIT_CARD" | "UNDEFINED";

export const cycleFromBillingPeriod = (period: string) =>
  period === "yearly" ? "YEARLY" : "MONTHLY";

export const centsToBrl = (cents: number) => Math.round(cents) / 100;
