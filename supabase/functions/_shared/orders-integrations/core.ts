// Núcleo puro das integrações de Pedidos: sanitização, mascaramento,
// classificação de erros, assinatura HMAC e backoff.
// Sem dependências de rede — testável isoladamente.
import {
  PermanentIntegrationError,
  TransientIntegrationError,
} from "./types.ts";

const SENSITIVE_KEYS = [
  "authorization",
  "token",
  "access_token",
  "refresh_token",
  "secret",
  "password",
  "api_key",
  "apikey",
  "signature",
  "card",
  "card_number",
  "cvv",
  "pan",
  "cpf",
  "cnpj",
  "document",
  "phone",
  "email",
];

const MAX_DEPTH = 8;
const MAX_ARRAY = 200;
const MAX_STRING = 2000;

function isSensitive(key: string): boolean {
  const k = key.toLowerCase();
  return SENSITIVE_KEYS.some((s) => k === s || k.includes(s));
}

/** Mascara valores sensíveis mantendo o formato reconhecível. */
export function maskValue(value: unknown): string {
  const text = String(value ?? "");
  if (!text) return "";
  const digits = text.replace(/\D/g, "");
  if (digits.length >= 8) return `***${digits.slice(-4)}`;
  if (text.includes("@")) {
    const [user, domain] = text.split("@");
    return `${user.slice(0, 1)}***@${domain ?? ""}`;
  }
  return text.length <= 4 ? "***" : `***${text.slice(-2)}`;
}

/**
 * Sanitiza o payload antes de persistir: mascara campos sensíveis, limita
 * profundidade, tamanho de arrays e de strings.
 */
export function sanitizePayload(input: unknown, depth = 0): unknown {
  if (input === null || input === undefined) return null;
  if (depth >= MAX_DEPTH) return "[truncated]";
  if (typeof input === "string") {
    return input.length > MAX_STRING ? `${input.slice(0, MAX_STRING)}…` : input;
  }
  if (typeof input === "number" || typeof input === "boolean") return input;
  if (Array.isArray(input)) {
    const items = input.slice(0, MAX_ARRAY).map((item) => sanitizePayload(item, depth + 1));
    if (input.length > MAX_ARRAY) items.push(`[+${input.length - MAX_ARRAY} itens]`);
    return items;
  }
  if (typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (isSensitive(key)) {
        out[key] = value === null || value === undefined ? null : maskValue(value);
      } else {
        out[key] = sanitizePayload(value, depth + 1);
      }
    }
    return out;
  }
  return null;
}

/** Mensagem de erro segura para persistir/retornar (sem stack trace). */
export function sanitizeErrorMessage(error: unknown): string {
  const raw =
    error instanceof Error ? error.message : typeof error === "string" ? error : "Erro desconhecido";
  return raw
    .replace(/https?:\/\/\S+/g, "[url]")
    .replace(/(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, "[token]")
    .replace(/eyJ[A-Za-z0-9._-]{10,}/g, "[jwt]")
    .replace(/\s+at\s+\S+:\d+:\d+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 400);
}

export interface ClassifiedError {
  errorClass: string;
  transient: boolean;
  message: string;
}

/** Erros transitórios podem ser repetidos; definitivos vão direto ao dead letter. */
export function classifyError(error: unknown): ClassifiedError {
  const message = sanitizeErrorMessage(error);
  if (error instanceof PermanentIntegrationError) {
    return { errorClass: error.errorClass, transient: false, message };
  }
  if (error instanceof TransientIntegrationError) {
    return { errorClass: error.errorClass, transient: true, message };
  }
  const lower = message.toLowerCase();
  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("aborted")) {
    return { errorClass: "timeout", transient: true, message };
  }
  if (
    lower.includes("fetch failed") ||
    lower.includes("network") ||
    lower.includes("econnreset") ||
    lower.includes("503") ||
    lower.includes("502") ||
    lower.includes("429")
  ) {
    return { errorClass: "upstream_unavailable", transient: true, message };
  }
  if (
    lower.includes("invalid") ||
    lower.includes("not found") ||
    lower.includes("mismatch") ||
    lower.includes("unsupported") ||
    lower.includes("forbidden") ||
    lower.includes("permission")
  ) {
    return { errorClass: "invalid_event", transient: false, message };
  }
  return { errorClass: "unknown", transient: true, message };
}

/** Espera antes da próxima tentativa (espelha `ped_queue_backoff`). */
export function backoffSeconds(attempts: number): number {
  const safe = Number.isFinite(attempts) && attempts > 0 ? Math.floor(attempts) : 0;
  return Math.min(3600, 5 * 2 ** safe);
}

/** Comparação em tempo constante de assinaturas. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** HMAC-SHA256 hex do corpo cru. */
export async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return toHex(signature);
}

/**
 * Verificação de assinatura HMAC. Fail closed: sem segredo, sem header ou
 * corpo vazio => inválido.
 */
export async function verifyHmacSignature(input: {
  rawBody: string;
  secret: string | null | undefined;
  provided: string | null | undefined;
}): Promise<boolean> {
  const { rawBody, secret, provided } = input;
  if (!secret || !provided || !rawBody) return false;
  const normalized = provided.trim().replace(/^sha256=/i, "").toLowerCase();
  const expected = await hmacSha256Hex(secret, rawBody);
  return timingSafeEqual(normalized, expected);
}

/** Cabeçalhos em minúsculas para leitura estável nos adaptadores. */
export function headersToObject(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

/** Evento fora de ordem: sequência menor/igual à já aplicada é descartada. */
export function isOutOfOrder(
  incomingSequence: number | null | undefined,
  appliedSequence: number | null | undefined,
): boolean {
  if (incomingSequence === null || incomingSequence === undefined) return false;
  if (appliedSequence === null || appliedSequence === undefined) return false;
  return incomingSequence <= appliedSequence;
}

/** Empresa nunca vem do payload: conflito é erro definitivo. */
export function assertCompanyConsistency(
  payloadCompanyId: string | null | undefined,
  integrationCompanyId: string,
): void {
  if (payloadCompanyId && payloadCompanyId !== integrationCompanyId) {
    throw new PermanentIntegrationError(
      "company_conflict",
      "Empresa do evento não corresponde à empresa da integração.",
    );
  }
}
