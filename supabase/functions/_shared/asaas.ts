// Shared Asaas API helper
const ASAAS_API_URL = Deno.env.get("ASAAS_API_URL") ?? "https://sandbox.asaas.com/api/v3";
const ASAAS_API_KEY = Deno.env.get("ASAAS_API_KEY") ?? "";

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
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) {
    const msg = data?.errors?.[0]?.description ?? data?.raw ?? `HTTP ${res.status}`;
    throw new Error(`Asaas ${path} [${res.status}]: ${msg}`);
  }
  return data;
}

export type AsaasBillingType = "PIX" | "BOLETO" | "CREDIT_CARD" | "UNDEFINED";

export const cycleFromBillingPeriod = (period: string) =>
  period === "yearly" ? "YEARLY" : "MONTHLY";

export const centsToBrl = (cents: number) => Math.round(cents) / 100;
