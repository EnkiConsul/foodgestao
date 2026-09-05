/**
 * Respostas HTTP padronizadas para Edge Functions.
 *
 * Regras do projeto:
 *  - nunca devolver ao cliente o texto cru de erro do banco (nomes de tabela,
 *    coluna e mensagens de RLS ajudam quem tenta mapear o sistema). O detalhe
 *    vai para o log do servidor; o cliente recebe mensagem genérica por tipo.
 *  - funções sensíveis (admin, auth, Pessoas) só liberam CORS para as origens
 *    do produto.
 */

const ALLOWED_HOST_SUFFIXES = [
  ".lovable.app",
  ".lovableproject.com",
  ".lovable.dev",
];
const ALLOWED_HOSTS = [
  "aveto360.com",
  "www.aveto360.com",
  "localhost",
  "127.0.0.1",
  "[::1]",
];

function isAllowedOrigin(origin: string): boolean {
  let host: string;
  try {
    host = new URL(origin).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (ALLOWED_HOSTS.includes(host)) return true;
  return ALLOWED_HOST_SUFFIXES.some((s) => host.endsWith(s));
}

/**
 * Cabeçalhos CORS restritos às origens do produto.
 * Origem desconhecida (ou ausente) não recebe liberação de origem — a chamada
 * continua possível fora do navegador, mas páginas de terceiros não conseguem
 * ler a resposta.
 */
export function strictCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
  if (origin && isAllowedOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  return headers;
}

export type ErrorKind =
  | "invalid_input"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "internal";

const MESSAGES: Record<ErrorKind, { status: number; message: string }> = {
  invalid_input: { status: 400, message: "Dados inválidos." },
  unauthorized: { status: 401, message: "Não autenticado." },
  forbidden: { status: 403, message: "Sem permissão para esta operação." },
  not_found: { status: 404, message: "Registro não encontrado." },
  conflict: { status: 409, message: "Operação conflita com o estado atual." },
  rate_limited: {
    status: 429,
    message: "Muitas tentativas. Aguarde e tente novamente.",
  },
  internal: { status: 500, message: "Não foi possível concluir a operação." },
};

export function jsonResponse(
  req: Request,
  status: number,
  body: unknown,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...strictCorsHeaders(req), "Content-Type": "application/json" },
  });
}

/**
 * Resposta de erro genérica. `detail` nunca vai para o cliente: só para o log.
 */
export function jsonError(
  req: Request,
  kind: ErrorKind,
  detail?: unknown,
  extra?: Record<string, unknown>,
): Response {
  const { status, message } = MESSAGES[kind];
  if (detail !== undefined) {
    const text =
      detail instanceof Error ? detail.message : typeof detail === "string" ? detail : JSON.stringify(detail);
    console.error(`[${kind}] ${text}`);
  }
  return jsonResponse(req, status, { error: message, ...(extra ?? {}) });
}
