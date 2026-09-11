import { supabase } from "@/integrations/supabase/client";

/**
 * Registro central de erros do sistema.
 *
 * Toda falha relevante (tela, banco, função do servidor, importação) é gravada
 * em `app_error_logs` agrupada por assinatura, para a tela de Auditoria de
 * erros mostrar o que precisa ser corrigido — sem repetir a mesma linha.
 */
export type ErrorSource = "client" | "database" | "edge" | "import";
export type ErrorSeverity = "error" | "warning" | "info";

export type ReportErrorInput = {
  /** Erro original (Error, PostgrestError, string...). */
  error: unknown;
  /** Tela/módulo onde ocorreu: "Importar documentos", "Convocações"... */
  surface?: string;
  /** Ação tentada: "publicar convocação", "salvar documento"... */
  action?: string;
  companyId?: string | null;
  severity?: ErrorSeverity;
  source?: ErrorSource;
  /** Mensagem que o usuário viu na tela. */
  userMessage?: string;
  /** Contexto adicional (ids, competência...). Nunca inclua dados sensíveis. */
  details?: Record<string, unknown>;
};

export type ErrorReportReadyDetail = {
  errorLogId: string;
  surface?: string;
  action?: string;
  userMessage?: string;
};

let currentCompanyId: string | null = null;
let latestReport: ErrorReportReadyDetail | null = null;

export function setErrorReportCompany(companyId: string | null) {
  currentCompanyId = companyId;
}

export function getLatestErrorReport() {
  return latestReport;
}

function messageOf(error: unknown): string {
  if (!error) return "Erro desconhecido";
  if (typeof error === "string") return error;
  const anyErr = error as Record<string, unknown>;
  const msg = anyErr.message ?? anyErr.error_description ?? anyErr.error ?? anyErr.details;
  if (typeof msg === "string" && msg.trim()) return msg.trim();
  try {
    return JSON.stringify(error).slice(0, 500);
  } catch {
    return String(error);
  }
}

function codeOf(error: unknown): string | null {
  const anyErr = (error ?? {}) as Record<string, unknown>;
  const code = anyErr.code ?? anyErr.status ?? anyErr.statusCode;
  return code == null ? null : String(code);
}

/** Assinatura estável: erros iguais na mesma tela/ação somam contador. */
export function fingerprintOf(input: {
  surface?: string;
  action?: string;
  code?: string | null;
  message: string;
}): string {
  const normalized = input.message
    .toLowerCase()
    // remove ids, datas e números para agrupar variações do mesmo erro
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "#id")
    .replace(/\d{4}-\d{2}-\d{2}/g, "#data")
    .replace(/\d+/g, "#n")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
  return [input.surface ?? "-", input.action ?? "-", input.code ?? "-", normalized].join("|");
}

let lastSent = new Map<string, number>();

/**
 * Grava o erro. Nunca lança: falhar ao registrar não pode quebrar a tela.
 * Repetições da mesma assinatura em menos de 15s são descartadas no cliente
 * para não inflar o contador em loops de render.
 */
export async function reportError(input: ReportErrorInput): Promise<string | null> {
  try {
    const message = messageOf(input.error);
    const code = codeOf(input.error);
    const fingerprint = fingerprintOf({
      surface: input.surface,
      action: input.action,
      code,
      message,
    });

    const now = Date.now();
    const prev = lastSent.get(fingerprint);
    if (prev && now - prev < 15_000) return latestReport?.errorLogId ?? null;
    if (lastSent.size > 200) lastSent = new Map();
    lastSent.set(fingerprint, now);

    const stack =
      input.error instanceof Error && input.error.stack ? input.error.stack.slice(0, 4000) : null;

    const { data, error } = await supabase.rpc("app_error_log_record", {
      _fingerprint: fingerprint,
      _message: message.slice(0, 2000),
      _company_id: input.companyId ?? currentCompanyId,
      _surface: input.surface ?? null,
      _route: typeof window !== "undefined" ? window.location.pathname : null,
      _action: input.action ?? null,
      _severity: input.severity ?? "error",
      _source: input.source ?? "client",
      _code: code,
      _user_message: input.userMessage ?? null,
      _details: {
        ...(input.details ?? {}),
        ...(stack ? { stack } : {}),
        agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 300) : undefined,
      } as never,
    });
    if (error) return null;
    const errorLogId = typeof data === "string" ? data : null;
    if (!errorLogId) return null;
    latestReport = {
      errorLogId,
      surface: input.surface,
      action: input.action,
      userMessage: input.userMessage,
    };
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent<ErrorReportReadyDetail>("app:error-report-ready", { detail: latestReport }));
    }
    return errorLogId;
  } catch {
    // silencioso por definição
    return null;
  }
}

export async function createErrorReport(input: {
  errorLogId: string;
  description: string;
  attemptedAction?: string;
}): Promise<{ id: string; protocol: string }> {
  const { data, error } = await supabase.rpc("app_error_report_create", {
    _error_log_id: input.errorLogId,
    _description: input.description.trim(),
    _attempted_action: input.attemptedAction?.trim() || null,
    _route: typeof window !== "undefined" ? window.location.pathname : null,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : null;
  if (!row?.id || !row?.protocol) throw new Error("Não foi possível gerar o protocolo do chamado.");
  return { id: row.id, protocol: row.protocol };
}
