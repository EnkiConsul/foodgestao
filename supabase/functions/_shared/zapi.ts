// Z-API helper — send WhatsApp messages via https://api.z-api.io
// Never logs message body or full phone. Returns { ok, messageId?, error? }.
// Follows Z-API guidelines: base URL /instances/{id}/token/{token}, Client-Token header,
// Content-Type: application/json, JSON body.

export type ZapiSendResult = {
  ok: boolean;
  messageId?: string;
  error?: string;
  httpStatus?: number;
};

export type ZapiStatusResult = {
  connected: boolean;
  error?: string;
};

const VALID_BR_DDDS = new Set<number>([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

/**
 * Normalize a phone string to E.164 digits without '+', ensuring Brazilian country code 55.
 * Prioritizes BR: if the local part (10 or 11 digits) starts with a valid DDD, always prepend 55.
 */
export function normalizeBRPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D+/g, "");
  if (!d) return null;
  if (d.startsWith("0")) d = d.replace(/^0+/, "");

  // Already carries BR country code (55 + 10/11 digits => 12/13)
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) {
    const ddd = parseInt(d.slice(2, 4), 10);
    if (VALID_BR_DDDS.has(ddd)) return d;
  }

  // Local BR (10 = fixed / 11 = mobile with leading 9) — always prepend 55 if DDD is valid
  if (d.length === 10 || d.length === 11) {
    const ddd = parseInt(d.slice(0, 2), 10);
    if (VALID_BR_DDDS.has(ddd)) return "55" + d;
  }

  // Foreign number (has its own country code) — accept 12-15 digits as-is
  if (d.length >= 12 && d.length <= 15) return d;

  return null;
}

function baseUrl(): { url: string; clientToken: string } | null {
  const instance = Deno.env.get("Z_API_INSTANCE_ID");
  const token = Deno.env.get("Z_API_TOKEN");
  const clientToken = Deno.env.get("Z_API_CLIENT_TOKEN");
  if (!instance || !token || !clientToken) {
    console.error("[zapi] Missing Z_API_* env vars");
    return null;
  }
  return {
    url: `https://api.z-api.io/instances/${instance}/token/${token}`,
    clientToken,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Check whether the Z-API instance is connected (WhatsApp session active).
 * Uses GET /status per Z-API docs. Safe to skip on error (fail-open with warning).
 */
export async function checkZapiStatus(): Promise<ZapiStatusResult> {
  const cfg = baseUrl();
  if (!cfg) return { connected: false, error: "zapi_not_configured" };
  try {
    const resp = await fetch(`${cfg.url}/status`, {
      method: "GET",
      headers: { "Client-Token": cfg.clientToken },
    });
    const raw = await resp.text();
    let parsed: any = null;
    try { parsed = JSON.parse(raw); } catch { /* text */ }
    if (!resp.ok) {
      console.error("[zapi] status non-2xx:", resp.status);
      return { connected: false, error: `http_${resp.status}` };
    }
    const connected = Boolean(parsed?.connected ?? parsed?.smartphoneConnected);
    return { connected };
  } catch (e) {
    console.error("[zapi] status exception:", (e as Error).message);
    return { connected: false, error: "network_error" };
  }
}

async function sendOnce(phoneE164: string, message: string): Promise<ZapiSendResult> {
  const cfg = baseUrl();
  if (!cfg) return { ok: false, error: "zapi_not_configured" };
  try {
    const resp = await fetch(`${cfg.url}/send-text`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Client-Token": cfg.clientToken,
      },
      body: JSON.stringify({ phone: phoneE164, message }),
    });
    const contentType = resp.headers.get("content-type") ?? "";
    const raw = await resp.text();
    let parsed: any = null;
    if (contentType.includes("application/json")) {
      try { parsed = JSON.parse(raw); } catch { /* ignore */ }
    }
    if (!resp.ok) {
      console.error(
        "[zapi] send-text non-2xx:",
        resp.status,
        parsed?.error ?? (contentType.includes("json") ? "unknown" : `non_json(${contentType})`),
      );
      return {
        ok: false,
        error: parsed?.error ?? `http_${resp.status}`,
        httpStatus: resp.status,
      };
    }
    const messageId = parsed?.messageId ?? parsed?.id ?? parsed?.zaapId;
    return { ok: true, messageId, httpStatus: resp.status };
  } catch (e) {
    console.error("[zapi] send-text exception:", (e as Error).message);
    return { ok: false, error: "network_error" };
  }
}

/**
 * Send a text message via Z-API with retry/backoff on transient failures.
 * Retries only on 5xx or network_error (never on 4xx which are permanent).
 */
export async function sendZapiText(phoneE164: string, message: string): Promise<ZapiSendResult> {
  const delaysMs = [0, 500, 1500]; // 3 attempts total
  let last: ZapiSendResult = { ok: false, error: "unknown" };
  for (let i = 0; i < delaysMs.length; i++) {
    if (delaysMs[i] > 0) await sleep(delaysMs[i]);
    last = await sendOnce(phoneE164, message);
    if (last.ok) return last;
    const transient =
      last.error === "network_error" ||
      (typeof last.httpStatus === "number" && last.httpStatus >= 500);
    if (!transient) return last;
  }
  return last;
}

/** Constant-time equal for two hex strings of equal length. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
