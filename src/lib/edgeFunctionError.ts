/**
 * Utilitário para extrair mensagens claras de erros retornados por Edge Functions.
 *
 * `supabase.functions.invoke` retorna um `FunctionsHttpError` quando o status HTTP
 * é >= 400, mas o corpo com o código de erro fica escondido em `error.context`
 * (um `Response` ainda não consumido). Este helper lê o corpo, extrai o `error`
 * e o `details`/`code` e devolve uma mensagem amigável ao usuário — mantendo o
 * código técnico para debug rápido.
 */

export type EdgeFunctionErrorInfo = {
  code: string;
  status: number | null;
  message: string;
  details?: unknown;
};

const FRIENDLY_MESSAGES: Record<string, string> = {
  unauthorized: "Sessão expirada. Faça login novamente e tente de novo.",
  forbidden_company_role:
    "Você não tem permissão de administrador nesta empresa para conectar bancos. Peça a um admin/owner para executar esta ação.",
  authorization_check_failed:
    "Não foi possível verificar suas permissões nesta empresa. Verifique se você é admin/owner e tente novamente. Se persistir, informe o suporte com o código 'authorization_check_failed'.",
  validation_failed: "Dados inválidos enviados para o servidor.",
  connection_id_required_for_update: "Reconexão precisa de um banco selecionado.",
  connection_lookup_failed: "Falha ao carregar a conexão. Tente novamente.",
  connection_not_found: "Conexão não encontrada ou não pertence a esta empresa.",
  request_persist_failed: "Não foi possível registrar a solicitação. Tente novamente.",
  item_not_found_in_pluggy:
    "Esta conexão não existe no ambiente de produção. Inicie uma nova conexão Open Finance.",
  item_id_invalid: "O identificador da conexão é inválido.",
  company_id_required: "Selecione a empresa antes de iniciar a conexão Open Finance.",
  company_id_required_on_first_connect:
    "Não foi possível identificar a empresa desta conexão. Inicie a conexão novamente pela empresa desejada.",
  forbidden: "Você não tem acesso a esta empresa.",
  unexpected_error: "Erro inesperado no servidor. Tente novamente em instantes.",
  method_not_allowed: "Método HTTP inválido.",
};

function friendly(code: string, extra?: string): string {
  const base = FRIENDLY_MESSAGES[code] ?? `Erro no servidor (${code}).`;
  return extra ? `${base} — ${extra}` : base;
}

export async function parseEdgeFunctionError(
  err: unknown,
  fallback = "Falha ao chamar o servidor",
): Promise<EdgeFunctionErrorInfo> {
  // FunctionsHttpError vem com `context: Response`
  // (https://supabase.com/docs/reference/javascript/functions-invoke)
  const anyErr = err as { context?: Response; message?: string } | null;
  const resp = anyErr?.context;
  let status: number | null = null;
  let body: unknown = null;

  if (resp && typeof resp === "object" && "status" in resp && typeof resp.json === "function") {
    status = (resp as Response).status ?? null;
    try {
      body = await (resp as Response).clone().json();
    } catch {
      try {
        body = await (resp as Response).clone().text();
      } catch {
        body = null;
      }
    }
  }

  const b = (body && typeof body === "object" ? body : {}) as {
    error?: string;
    code?: string;
    details?: unknown;
    message?: string;
  };
  const code = (b.error || b.code || "unknown_error").toString();
  const extra = typeof b.message === "string" ? b.message : undefined;
  const message =
    code === "unknown_error"
      ? anyErr?.message || fallback
      : friendly(code, extra);

  return { code, status, message, details: b.details };
}

export function formatEdgeFunctionError(info: EdgeFunctionErrorInfo): string {
  const parts = [info.message];
  if (info.status) parts.push(`HTTP ${info.status}`);
  parts.push(`código: ${info.code}`);
  return parts.join(" · ");
}
