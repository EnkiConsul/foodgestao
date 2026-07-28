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

export async function createConnectToken(
  itemId?: string,
  options?: { oauthRedirectUri?: string; clientUserId?: string },
): Promise<{ accessToken: string }> {
  const body: Record<string, unknown> = {};
  if (itemId) body.itemId = itemId;
  const tokenOptions: Record<string, unknown> = {};
  if (options?.oauthRedirectUri) tokenOptions.oauthRedirectUri = options.oauthRedirectUri;
  if (options?.clientUserId) tokenOptions.clientUserId = options.clientUserId;
  if (Object.keys(tokenOptions).length > 0) body.options = tokenOptions;
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
  // Uses Pluggy's cursor-based /v2/transactions endpoint.
  // Params: accountId, dateFrom (yyyy-mm-dd), dateTo (yyyy-mm-dd), after (cursor).
  const all: any[] = [];
  let after: string | null = null;
  let safety = 0;
  while (true) {
    const params = new URLSearchParams({
      accountId,
      dateFrom: from,
      dateTo: to,
    });
    if (after) params.set("after", after);
    const res = await pluggyFetch(`/v2/transactions?${params.toString()}`);
    if (!res.ok) throw new Error(`list_transactions_failed: ${res.status} ${await res.text()}`);
    const j = await res.json();
    const rows = j.results ?? [];
    all.push(...rows);
    const next: string | null = j.next ?? j.nextCursor ?? null;
    if (!next || rows.length === 0) break;
    after = next;
    if (++safety > 40) break; // hard safety cap
  }
  return all;
}

export async function deleteItem(itemId: string): Promise<void> {
  const res = await pluggyFetch(`/items/${itemId}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) throw new Error(`delete_item_failed: ${res.status}`);
}

/** Dispara uma nova coleta no banco (refresh do item). */
export async function refreshItem(itemId: string) {
  const res = await pluggyFetch(`/items/${itemId}`, { method: "PATCH", body: JSON.stringify({}) });
  if (!res.ok) throw new Error(`refresh_item_failed: ${res.status} ${await res.text()}`);
  return res.json();
}

const FINAL_EXEC_STATUSES = [
  "SUCCESS",
  "PARTIAL_SUCCESS",
  "LOGIN_ERROR",
  "INVALID_CREDENTIALS",
  "ALREADY_LOGGED_IN",
  "USER_INPUT_TIMEOUT",
  "ERROR",
  "SITE_NOT_AVAILABLE",
  "CONNECTION_ERROR",
  "ACCOUNT_LOCKED",
  "USER_AUTHORIZATION_PENDING",
  "USER_AUTHORIZATION_NOT_GRANTED",
];

/** Aguarda o item terminar a coleta (ou o timeout). Retorna o item mais recente. */
export async function waitForItem(itemId: string, timeoutMs = 45000) {
  const started = Date.now();
  let item = await getItem(itemId);
  while (Date.now() - started < timeoutMs) {
    const exec = String(item?.executionStatus ?? "").toUpperCase();
    const status = String(item?.status ?? "").toUpperCase();
    if (status === "WAITING_USER_INPUT" || FINAL_EXEC_STATUSES.includes(exec)) break;
    await new Promise((r) => setTimeout(r, 3000));
    item = await getItem(itemId);
  }
  return item;
}
