// Z-API helper — send WhatsApp messages via https://z-api.io
// Never logs message body or full phone. Returns { ok, messageId?, error? }.

export type ZapiSendResult = {
  ok: boolean;
  messageId?: string;
  error?: string;
};

/** Normalize a phone string to E.164 digits without '+', ensuring Brazilian country code 55. */
export function normalizeBRPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D+/g, "");
  if (!d) return null;
  // Strip leading 0
  if (d.startsWith("0")) d = d.replace(/^0+/, "");
  // If already has country code (55) and length >= 12, keep as is
  if (d.length >= 12 && d.startsWith("55")) return d;
  // If 10 or 11 digits (Brazilian without country code), prepend 55
  if (d.length === 10 || d.length === 11) return "55" + d;
  // If 12/13 digits without leading 55 — leave as is (already includes country)
  if (d.length >= 11 && d.length <= 15) return d;
  return null;
}

export async function sendZapiText(phoneE164: string, message: string): Promise<ZapiSendResult> {
  const instance = Deno.env.get("Z_API_INSTANCE_ID");
  const token = Deno.env.get("Z_API_TOKEN");
  const clientToken = Deno.env.get("Z_API_CLIENT_TOKEN");
  if (!instance || !token || !clientToken) {
    console.error("[zapi] Missing Z_API_* env vars");
    return { ok: false, error: "zapi_not_configured" };
  }
  const url = `https://api.z-api.io/instances/${instance}/token/${token}/send-text`;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Client-Token": clientToken,
      },
      body: JSON.stringify({ phone: phoneE164, message }),
    });
    const raw = await resp.text();
    let parsed: any = null;
    try { parsed = JSON.parse(raw); } catch { /* text */ }
    if (!resp.ok) {
      console.error("[zapi] send-text non-2xx:", resp.status, parsed?.error ?? raw.slice(0, 200));
      return { ok: false, error: parsed?.error ?? `http_${resp.status}` };
    }
    const messageId = parsed?.messageId ?? parsed?.id ?? parsed?.zaapId;
    return { ok: true, messageId };
  } catch (e) {
    console.error("[zapi] send-text exception:", (e as Error).message);
    return { ok: false, error: "network_error" };
  }
}

/** Constant-time equal for two hex strings of equal length. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
