// Pluggy API client — shared across Open Finance edge functions.
// Docs: https://docs.pluggy.ai
//
// Responsibilities:
//   - Authenticate via POST /auth and cache the returned apiKey (~2h TTL).
//   - Wrap fetch with exponential backoff for 429/5xx.
//   - Expose helpers used by connect-token, item-delete, sync workers, etc.
//
// Never logs Client-Id, Client-Secret, apiKey, connect tokens, item IDs or
// account numbers. Returned errors omit sensitive headers/payloads.

const BASE_URL = "https://api.pluggy.ai";
const API_KEY_TTL_MS = 2 * 60 * 60 * 1000 - 5 * 60 * 1000; // ~1h55 to avoid edge expiry

type ApiKeyCache = { apiKey: string; expiresAt: number };
let apiKeyCache: ApiKeyCache | null = null;

function getCredentials(): { clientId: string; clientSecret: string } {
  const clientId = Deno.env.get("PLUGGY_CLIENT_ID") ?? "";
  const clientSecret = Deno.env.get("PLUGGY_CLIENT_SECRET") ?? "";
  if (!clientId || !clientSecret) {
    throw new Error("PLUGGY_CREDENTIALS_MISSING");
  }
  return { clientId, clientSecret };
}

export class PluggyError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code = "PLUGGY_ERROR") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Redact any potentially sensitive fields from a Pluggy error body before
// surfacing it to callers/logs.
function safePluggyMessage(raw: unknown, fallback = "pluggy_request_failed"): string {
  if (!raw || typeof raw !== "object") return fallback;
  const anyRaw = raw as Record<string, unknown>;
  const msg =
    (typeof anyRaw.message === "string" && anyRaw.message) ||
    (typeof anyRaw.error === "string" && anyRaw.error) ||
    (typeof anyRaw.code === "string" && anyRaw.code) ||
    fallback;
  return String(msg).slice(0, 200);
}

async function authenticate(): Promise<string> {
  const now = Date.now();
  if (apiKeyCache && apiKeyCache.expiresAt > now) return apiKeyCache.apiKey;

  const { clientId, clientSecret } = getCredentials();
  const res = await fetch(`${BASE_URL}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, clientSecret }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new PluggyError(safePluggyMessage(body, "auth_failed"), res.status, "PLUGGY_AUTH_FAILED");
  }

  const data = (await res.json()) as { apiKey?: string };
  if (!data.apiKey) throw new PluggyError("auth_missing_api_key", 502, "PLUGGY_AUTH_FAILED");

  apiKeyCache = { apiKey: data.apiKey, expiresAt: now + API_KEY_TTL_MS };
  return data.apiKey;
}

// Force refresh of the cached apiKey — used after 401 responses.
function invalidateApiKey() {
  apiKeyCache = null;
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  retries?: number;
};

async function pluggyFetch<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const method = opts.method ?? "GET";
  const retries = opts.retries ?? 3;
  const query = opts.query ?? {};
  const qs = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  const url = `${BASE_URL}${path}${qs ? `?${qs}` : ""}`;

  let attempt = 0;
  let lastErr: PluggyError | null = null;

  while (attempt <= retries) {
    const apiKey = await authenticate();
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": apiKey,
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      });
    } catch (err) {
      // Network error — retry with backoff.
      lastErr = new PluggyError((err as Error).message || "network_error", 0, "PLUGGY_NETWORK");
      const delay = Math.min(4000, 300 * 2 ** attempt);
      await sleep(delay);
      attempt++;
      continue;
    }

    if (res.status === 401) {
      // apiKey may have expired; refresh once and retry immediately.
      invalidateApiKey();
      if (attempt === 0) {
        attempt++;
        continue;
      }
    }

    if (res.status === 429 || res.status >= 500) {
      const body = await res.json().catch(() => null);
      lastErr = new PluggyError(
        safePluggyMessage(body, "pluggy_transient"),
        res.status,
        res.status === 429 ? "PLUGGY_RATE_LIMITED" : "PLUGGY_SERVER_ERROR",
      );
      const delay = Math.min(8000, 400 * 2 ** attempt);
      await sleep(delay);
      attempt++;
      continue;
    }

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new PluggyError(safePluggyMessage(body), res.status, "PLUGGY_BAD_REQUEST");
    }

    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
  }

  throw lastErr ?? new PluggyError("pluggy_exhausted_retries", 502, "PLUGGY_EXHAUSTED");
}

// -------------- Public helpers ---------------

export type ConnectTokenOptions = {
  itemId?: string; // update mode — reconnect existing item
  clientUserId?: string; // recommended: internal user or company id
  webhookUrl?: string;
  includeSandbox?: boolean;
};

export async function createConnectToken(opts: ConnectTokenOptions = {}): Promise<{ accessToken: string }> {
  const body: Record<string, unknown> = {};
  if (opts.itemId) body.itemId = opts.itemId;
  if (opts.clientUserId) body.clientUserId = opts.clientUserId;
  const options: Record<string, unknown> = {};
  if (opts.webhookUrl) options.webhookUrl = opts.webhookUrl;
  if (opts.includeSandbox) options.includeSandbox = true;
  if (Object.keys(options).length) body.options = options;

  return pluggyFetch<{ accessToken: string }>("/connect_token", {
    method: "POST",
    body,
  });
}

export type PluggyItem = {
  id: string;
  connector: { id: number; name: string; institutionUrl?: string; imageUrl?: string; primaryColor?: string };
  status: string;
  executionStatus?: string;
  createdAt: string;
  updatedAt: string;
  lastUpdatedAt?: string;
  webhookUrl?: string;
  error?: { code?: string; message?: string } | null;
  consentExpiresAt?: string | null;
  nextAutoSyncAt?: string | null;
};

export async function getItem(itemId: string): Promise<PluggyItem> {
  return pluggyFetch<PluggyItem>(`/items/${itemId}`);
}

export async function deleteItem(itemId: string): Promise<void> {
  await pluggyFetch<void>(`/items/${itemId}`, { method: "DELETE" });
}

export type PluggyAccount = {
  id: string;
  itemId: string;
  type: string; // BANK, CREDIT
  subtype?: string;
  name: string;
  marketingName?: string;
  number?: string;
  balance: number;
  currencyCode: string;
  bankData?: { transferNumber?: string; closingBalance?: number };
  creditData?: {
    level?: string;
    brand?: string;
    balanceCloseDate?: string;
    balanceDueDate?: string;
    availableCreditLimit?: number;
    creditLimit?: number;
  } | null;
  taxNumber?: string;
  owner?: string;
};

export async function listAccounts(itemId: string): Promise<PluggyAccount[]> {
  const res = await pluggyFetch<{ results: PluggyAccount[] }>("/accounts", { query: { itemId } });
  return res.results ?? [];
}

export type PluggyTransaction = {
  id: string;
  accountId: string;
  amount: number;
  amountInAccountCurrency?: number;
  currencyCode: string;
  date: string;
  description: string;
  descriptionRaw?: string;
  type: "DEBIT" | "CREDIT";
  status?: string;
  category?: string;
  categoryId?: string;
  balance?: number;
  paymentData?: Record<string, unknown> | null;
  creditCardMetadata?: Record<string, unknown> | null;
  merchant?: Record<string, unknown> | null;
  providerCode?: string | null;
};

export type ListTransactionsParams = {
  accountId: string;
  from?: string; // YYYY-MM-DD
  to?: string;
  page?: number;
  pageSize?: number;
};

export async function listTransactions(params: ListTransactionsParams): Promise<{
  results: PluggyTransaction[];
  page: number;
  totalPages: number;
  total: number;
}> {
  return pluggyFetch<{
    results: PluggyTransaction[];
    page: number;
    totalPages: number;
    total: number;
  }>("/transactions", {
    query: {
      accountId: params.accountId,
      from: params.from,
      to: params.to,
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 500,
    },
  });
}
