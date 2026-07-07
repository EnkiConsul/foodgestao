// Cliente compartilhado da API Pluggy (Open Finance).
// Encapsula autenticação (apiKey com cache) e helpers para os endpoints usados.

const PLUGGY_BASE = "https://api.pluggy.ai";

let cachedApiKey: { key: string; expiresAt: number } | null = null;

async function fetchApiKey(): Promise<string> {
  const now = Date.now();
  if (cachedApiKey && cachedApiKey.expiresAt > now + 60_000) {
    return cachedApiKey.key;
  }
  const clientId = Deno.env.get("PLUGGY_CLIENT_ID");
  const clientSecret = Deno.env.get("PLUGGY_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("PLUGGY_CLIENT_ID/PLUGGY_CLIENT_SECRET não configurados");
  }
  const res = await fetch(`${PLUGGY_BASE}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, clientSecret }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Pluggy /auth falhou: ${res.status} ${txt}`);
  }
  const json = (await res.json()) as { apiKey: string };
  // apiKey Pluggy dura ~2h; guardamos 100min p/ margem.
  cachedApiKey = { key: json.apiKey, expiresAt: now + 100 * 60_000 };
  return json.apiKey;
}

async function pluggyFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const apiKey = await fetchApiKey();
  const headers = new Headers(init.headers ?? {});
  headers.set("X-API-KEY", apiKey);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${PLUGGY_BASE}${path}`, { ...init, headers });
}

export interface PluggyItem {
  id: string;
  status: string;
  connector: { id: number; name: string; imageUrl?: string; primaryColor?: string };
  createdAt: string;
  updatedAt: string;
  consentExpiresAt?: string | null;
}

export interface PluggyAccount {
  id: string;
  type: string;
  subtype?: string;
  name: string;
  number?: string;
  balance: number;
  currencyCode: string;
  itemId: string;
}

export interface PluggyTransaction {
  id: string;
  description: string;
  descriptionRaw?: string;
  amount: number;
  date: string; // ISO
  type?: "DEBIT" | "CREDIT";
  category?: string;
  accountId: string;
}

export async function createConnectToken(opts: {
  clientUserId: string;
  itemId?: string;
  webhookUrl?: string;
}): Promise<string> {
  const body: Record<string, unknown> = {
    clientUserId: opts.clientUserId,
    options: {
      products: ["ACCOUNTS", "TRANSACTIONS", "IDENTITY"],
    },
  };
  if (opts.itemId) body.itemId = opts.itemId;
  if (opts.webhookUrl) body.webhookUrl = opts.webhookUrl;
  const res = await pluggyFetch("/connect_token", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Pluggy connect_token: ${res.status} ${t}`);
  }
  const json = (await res.json()) as { accessToken: string };
  return json.accessToken;
}

export async function getItem(itemId: string): Promise<PluggyItem> {
  const res = await pluggyFetch(`/items/${itemId}`);
  if (!res.ok) throw new Error(`Pluggy getItem: ${res.status}`);
  return (await res.json()) as PluggyItem;
}

export async function deleteItem(itemId: string): Promise<void> {
  const res = await pluggyFetch(`/items/${itemId}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Pluggy deleteItem: ${res.status}`);
  }
  if (res.body) await res.text();
}

export async function listAccounts(itemId: string): Promise<PluggyAccount[]> {
  const res = await pluggyFetch(`/accounts?itemId=${encodeURIComponent(itemId)}`);
  if (!res.ok) throw new Error(`Pluggy listAccounts: ${res.status}`);
  const json = (await res.json()) as { results: PluggyAccount[] };
  return json.results ?? [];
}

export async function listTransactions(opts: {
  accountId: string;
  from?: string; // yyyy-mm-dd
  to?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ results: PluggyTransaction[]; totalPages: number; page: number }> {
  const params = new URLSearchParams({ accountId: opts.accountId });
  if (opts.from) params.set("from", opts.from);
  if (opts.to) params.set("to", opts.to);
  params.set("page", String(opts.page ?? 1));
  params.set("pageSize", String(opts.pageSize ?? 500));
  const res = await pluggyFetch(`/transactions?${params.toString()}`);
  if (!res.ok) throw new Error(`Pluggy listTransactions: ${res.status}`);
  return (await res.json()) as { results: PluggyTransaction[]; totalPages: number; page: number };
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, DELETE",
};
