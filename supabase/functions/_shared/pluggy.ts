// Shared Pluggy REST client helper
const PLUGGY_API = "https://api.pluggy.ai";

let cachedApiKey: { token: string; expiresAt: number } | null = null;

export async function getPluggyApiKey(): Promise<string> {
  // Pluggy API keys expire in ~2h. Cache for 90 min.
  if (cachedApiKey && Date.now() < cachedApiKey.expiresAt) {
    return cachedApiKey.token;
  }
  const clientId = Deno.env.get("PLUGGY_CLIENT_ID");
  const clientSecret = Deno.env.get("PLUGGY_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("pluggy_credentials_missing");

  const res = await fetch(`${PLUGGY_API}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, clientSecret }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`pluggy_auth_failed: ${res.status} ${t}`);
  }
  const data = await res.json();
  cachedApiKey = { token: data.apiKey, expiresAt: Date.now() + 90 * 60 * 1000 };
  return data.apiKey;
}

export async function pluggyFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const apiKey = await getPluggyApiKey();
  const headers = new Headers(init.headers);
  headers.set("X-API-KEY", apiKey);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(`${PLUGGY_API}${path}`, { ...init, headers });
}

export async function createConnectToken(itemId?: string): Promise<{ accessToken: string }> {
  const body: Record<string, unknown> = {};
  if (itemId) body.itemId = itemId;
  const res = await pluggyFetch("/connect_token", { method: "POST", body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`connect_token_failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function getItem(itemId: string) {
  const res = await pluggyFetch(`/items/${itemId}`);
  if (!res.ok) throw new Error(`get_item_failed: ${res.status}`);
  return res.json();
}

export async function listAccounts(itemId: string) {
  const res = await pluggyFetch(`/accounts?itemId=${itemId}`);
  if (!res.ok) throw new Error(`list_accounts_failed: ${res.status}`);
  const j = await res.json();
  return j.results ?? [];
}

export async function listTransactions(accountId: string, from: string, to: string) {
  const all: any[] = [];
  let page = 1;
  const pageSize = 500;
  while (true) {
    const url = `/transactions?accountId=${accountId}&from=${from}&to=${to}&pageSize=${pageSize}&page=${page}`;
    const res = await pluggyFetch(url);
    if (!res.ok) throw new Error(`list_transactions_failed: ${res.status}`);
    const j = await res.json();
    const rows = j.results ?? [];
    all.push(...rows);
    if (rows.length < pageSize) break;
    page++;
    if (page > 40) break; // hard safety cap
  }
  return all;
}

export async function deleteItem(itemId: string): Promise<void> {
  const res = await pluggyFetch(`/items/${itemId}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) throw new Error(`delete_item_failed: ${res.status}`);
}
