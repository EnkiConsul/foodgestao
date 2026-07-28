// Pluggy REST client — Open Finance Brasil
// Docs: https://docs.pluggy.ai
// Follows the same pattern as _shared/zapi.ts: retry/backoff, safe errors (never leak secrets).
// Auth flow: POST /auth with { clientId, clientSecret } -> { apiKey } (short lived, ~2h).

const PLUGGY_BASE = "https://api.pluggy.ai";
// Fallback (a doc cita ~2h). Se o /auth retornar um JWT com `exp`, usamos ele
// menos 5 min como TTL real (ver authenticate()).
const AUTH_TTL_FALLBACK_MS = 90 * 60 * 1000;
const AUTH_TTL_MAX_MS = 2 * 60 * 60 * 1000;

type Cached = { apiKey: string; expiresAt: number };
let cached: Cached | null = null;

export interface PluggyAccount {
  id: string;
  type: "BANK" | "CREDIT";
  subtype?: string;
  name?: string;
  marketingName?: string;
  number?: string;
  balance?: number;
  currencyCode?: string;
  itemId: string;
  taxNumber?: string;
  owner?: string;
  bankData?: { transferNumber?: string; closingBalance?: number };
  creditData?: {
    level?: string;
    brand?: string;
    balanceCloseDate?: string;
    balanceDueDate?: string;
    availableCreditLimit?: number;
    creditLimit?: number;
  };
}

export interface PluggyTransaction {
  id: string;
  accountId: string;
  amount: number;
  balance?: number | null;
  currencyCode?: string;
  date: string;
  description: string;
  descriptionRaw?: string;
  category?: string;
  categoryId?: string;
  type: "DEBIT" | "CREDIT";
  status?: "POSTED" | "PENDING";
  merchant?: { name?: string; cnpj?: string; businessName?: string };
  paymentData?: {
    payer?: { name?: string; taxNumber?: string };
    receiver?: { name?: string; taxNumber?: string };
    reason?: string;
  };
}

export interface PluggyItem {
  id: string;
  connector: { id: number; name: string; imageUrl?: string; primaryColor?: string };
  status: string;
  executionStatus?: string;
  createdAt: string;
  updatedAt: string;
  consentExpiresAt?: string;
  lastUpdatedAt?: string;
  clientUserId?: string;
  webhookUrl?: string;
  error?: { code?: string; message?: string };
}

function creds(): { clientId: string; clientSecret: string } | null {
  const clientId = Deno.env.get("PLUGGY_CLIENT_ID");
  const clientSecret = Deno.env.get("PLUGGY_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    console.error("[pluggy] Missing PLUGGY_CLIENT_ID / PLUGGY_CLIENT_SECRET");
    return null;
  }
  return { clientId, clientSecret };
}

export function safePluggyError(raw: unknown, httpStatus?: number): string {
  const fallback = typeof httpStatus === "number" ? `http_${httpStatus}` : "pluggy_error";
  if (!raw) return fallback;
  const text = typeof raw === "string" ? raw : (raw as any)?.message ?? JSON.stringify(raw);
  if (typeof text !== "string") return fallback;
  const t = text.trim();
  if (!t) return fallback;
  if (/api[-_ ]?key|client[-_ ]?(id|secret)|authorization|bearer|token|secret/i.test(t)) return fallback;
  if (t.length > 120) return fallback;
  return t;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function decodeJwtExpMs(jwt: string): number | null {
  try {
    const parts = jwt.split(".");
    if (parts.length < 2) return null;
    // atob-safe base64url decode
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json = JSON.parse(atob(padded));
    if (typeof json?.exp === "number") return json.exp * 1000;
    return null;
  } catch { return null; }
}

async function authenticate(): Promise<string | null> {
  const c = creds();
  if (!c) return null;
  const resp = await fetch(`${PLUGGY_BASE}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: c.clientId, clientSecret: c.clientSecret }),
  });
  if (!resp.ok) {
    const raw = await resp.text().catch(() => "");
    console.error("[pluggy] /auth failed:", resp.status, safePluggyError(raw, resp.status));
    return null;
  }
  const data = await resp.json().catch(() => null);
  const apiKey = data?.apiKey;
  if (!apiKey) return null;
  const now = Date.now();
  const expFromJwt = decodeJwtExpMs(apiKey);
  const ttlFromJwt = expFromJwt ? Math.max(60_000, expFromJwt - now - 5 * 60_000) : null;
  const ttl = Math.min(ttlFromJwt ?? AUTH_TTL_FALLBACK_MS, AUTH_TTL_MAX_MS);
  cached = { apiKey, expiresAt: now + ttl };
  return apiKey;
}

async function getApiKey(force = false): Promise<string | null> {
  if (!force && cached && cached.expiresAt > Date.now()) return cached.apiKey;
  return await authenticate();
}

async function requestOnce<T>(
  method: string,
  path: string,
  body?: unknown,
  retryOn401 = true,
): Promise<
  | { ok: true; data: T }
  | { ok: false; error: string; httpStatus?: number; retryAfterMs?: number }
> {
  const apiKey = await getApiKey();
  if (!apiKey) return { ok: false, error: "pluggy_not_configured" };
  try {
    const resp = await fetch(`${PLUGGY_BASE}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": apiKey,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (resp.status === 401 && retryOn401) {
      cached = null;
      return await requestOnce<T>(method, path, body, false);
    }
    const raw = await resp.text();
    let parsed: any = null;
    try { parsed = raw ? JSON.parse(raw) : null; } catch { /* text */ }
    if (!resp.ok) {
      const err = safePluggyError(parsed?.message ?? parsed?.error ?? raw, resp.status);
      console.error(`[pluggy] ${method} ${path} non-2xx:`, resp.status, err);
      let retryAfterMs: number | undefined;
      if (resp.status === 429) {
        const header = resp.headers.get("retry-after");
        if (header) {
          const asInt = parseInt(header, 10);
          if (Number.isFinite(asInt) && asInt >= 0) retryAfterMs = Math.min(asInt * 1000, 30_000);
        }
      }
      return { ok: false, error: err, httpStatus: resp.status, retryAfterMs };
    }
    return { ok: true, data: parsed as T };
  } catch (e) {
    console.error(`[pluggy] ${method} ${path} exception: network_error`);
    return { ok: false, error: "network_error" };
  }
}

async function request<T>(method: string, path: string, body?: unknown) {
  const delays = [0, 500, 1500, 4000];
  let last: any = { ok: false, error: "unknown" };
  for (let i = 0; i < delays.length; i++) {
    const wait = last?.retryAfterMs ?? delays[i];
    if (wait > 0) await sleep(wait);
    last = await requestOnce<T>(method, path, body);
    if (last.ok) return last as { ok: true; data: T };
    const transient = last.error === "network_error"
      || last.httpStatus === 429
      || (typeof last.httpStatus === "number" && last.httpStatus >= 500);
    if (!transient) return last as { ok: false; error: string; httpStatus?: number };
  }
  return last as { ok: false; error: string; httpStatus?: number };
}

/**
 * Create a short-lived connect token for the widget.
 *
 * Contract (Pluggy — https://docs.pluggy.ai/docs/authentication):
 *   POST /connect_token
 *   Body: { itemId?: string, options?: { clientUserId?, avoidDuplicates?, webhookUrl?, oauthRedirectUrl? } }
 *
 * - `itemId` (root) só em fluxos update/reconnect.
 * - `avoidDuplicates` NÃO é enviado quando `itemId` está presente (a Pluggy
 *   pode rejeitar reconnects como duplicados do próprio item que estamos
 *   atualizando).
 * - `oauthRedirectUrl` é necessário para conectores OAuth (Itaú, Bradesco, …).
 */
export async function createConnectToken(input: {
  clientUserId: string;
  webhookUrl?: string;
  avoidDuplicates?: boolean;
  itemId?: string; // update/reconnect
  oauthRedirectUrl?: string;
}) {
  const isReconnect = !!input.itemId;
  const options: Record<string, unknown> = {
    clientUserId: input.clientUserId,
    ...(input.webhookUrl ? { webhookUrl: input.webhookUrl } : {}),
    ...(input.oauthRedirectUrl ? { oauthRedirectUrl: input.oauthRedirectUrl } : {}),
  };
  if (!isReconnect) {
    options.avoidDuplicates = input.avoidDuplicates ?? true;
  }
  const body: Record<string, unknown> = { options };
  if (input.itemId) body.itemId = input.itemId;
  return await request<{ accessToken: string }>("POST", "/connect_token", body);
}


export async function getItem(itemId: string) {
  return await request<PluggyItem>("GET", `/items/${itemId}`);
}

export async function listAccounts(itemId: string) {
  return await request<{ results: PluggyAccount[] }>(
    "GET",
    `/accounts?itemId=${encodeURIComponent(itemId)}`,
  );
}

export async function listTransactions(params: {
  accountId: string;
  from?: string; // YYYY-MM-DD
  to?: string;
  pageSize?: number;
  page?: number;
}) {
  const qs = new URLSearchParams();
  qs.set("accountId", params.accountId);
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  qs.set("pageSize", String(params.pageSize ?? 500));
  qs.set("page", String(params.page ?? 1));
  return await request<{
    total: number;
    page: number;
    totalPages: number;
    results: PluggyTransaction[];
  }>("GET", `/transactions?${qs.toString()}`);
}

export async function deleteItem(itemId: string) {
  return await request<{ id: string }>("DELETE", `/items/${itemId}`);
}

export async function listItems(params: { page?: number; pageSize?: number } = {}) {
  const qs = new URLSearchParams();
  qs.set("page", String(params.page ?? 1));
  qs.set("pageSize", String(params.pageSize ?? 100));
  return await request<{
    total: number;
    page: number;
    totalPages: number;
    results: PluggyItem[];
  }>("GET", `/items?${qs.toString()}`);
}

