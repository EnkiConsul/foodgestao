// Shared Asaas API helper
function normalizeBaseUrl(raw: string | undefined): string {
  let url = (raw ?? "").trim().replace(/\/+$/, "");
  if (!url) return "https://sandbox.asaas.com/api/v3";
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  // Aceita "https://api.asaas.com" ou ".../api" e completa a versão
  if (!/\/v3$/i.test(url)) url = `${url}/v3`;
  return url;
}

const ASAAS_API_URL = normalizeBaseUrl(Deno.env.get("ASAAS_API_URL"));
const ASAAS_API_KEY = (Deno.env.get("ASAAS_API_KEY") ?? "").trim();

export async function asaasFetch(path: string, init: RequestInit = {}) {
  if (!ASAAS_API_KEY) throw new Error("ASAAS_API_KEY not configured");
  const url = `${ASAAS_API_URL}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "access_token": ASAAS_API_KEY,
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
    console.error(`Asaas ${init.method ?? "GET"} ${path} falhou [${res.status}]`, isJson ? JSON.stringify(data).slice(0, 500) : text.slice(0, 200));
    throw new Error(`Asaas ${path} [${res.status}]: ${msg}`);
  }
  if (!isJson) {
    console.error(`Asaas ${path} respondeu não-JSON (base ${ASAAS_API_URL}):`, text.slice(0, 200));
    throw new Error(`Asaas respondeu em formato inesperado — verifique o endereço da API (ASAAS_API_URL).`);
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
