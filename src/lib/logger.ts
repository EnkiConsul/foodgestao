/**
 * Logger centralizado do Aveto 360.
 *
 * Objetivo: ter um único ponto de saída para erros/avisos do front-end, para que
 * a instrumentação (Sentry, Logflare, etc.) possa ser ligada sem varrer o código.
 *
 * - Em desenvolvimento: escreve no console com contexto legível.
 * - Em produção: silencia `debug`, mantém `warn`/`error` e envia para o sink
 *   global (`window.__360_ERROR_SINK__`) quando existir.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  /** Área funcional: "financeiro", "dp", "auth", "pluggy"... */
  scope?: string;
  /** Dados extras — nunca inclua PII ou tokens aqui. */
  [key: string]: unknown;
}

type ErrorSink = (payload: {
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: unknown;
  at: string;
}) => void;

declare global {
  interface Window {
    __360_ERROR_SINK__?: ErrorSink;
  }
}

const isDev = import.meta.env.DEV;

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const MIN_LEVEL: LogLevel = isDev ? "debug" : "warn";

function shouldLog(level: LogLevel) {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[MIN_LEVEL];
}

function emit(level: LogLevel, message: string, context?: LogContext, error?: unknown) {
  if (!shouldLog(level)) return;

  const prefix = context?.scope ? `[${context.scope}]` : "[app]";

  if (level === "error") {
    console.error(prefix, message, context ?? {}, error ?? "");
  } else if (level === "warn") {
    console.warn(prefix, message, context ?? {});
  } else if (level === "info") {
    console.info(prefix, message, context ?? {});
  } else {
    console.debug(prefix, message, context ?? {});
  }

  if (level === "warn" || level === "error") {
    try {
      window.__360_ERROR_SINK__?.({
        level,
        message,
        context,
        error,
        at: new Date().toISOString(),
      });
    } catch {
      // sink nunca deve derrubar a aplicação
    }
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) => emit("debug", message, context),
  info: (message: string, context?: LogContext) => emit("info", message, context),
  warn: (message: string, context?: LogContext) => emit("warn", message, context),
  error: (message: string, error?: unknown, context?: LogContext) =>
    emit("error", message, context, error),
};

/** Extrai uma mensagem legível de qualquer valor lançado. */
export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Erro inesperado";
}

/**
 * Liga os handlers globais de erro (uma vez por sessão).
 * Captura o que escapa dos Error Boundaries: erros assíncronos e promises rejeitadas.
 */
let globalHandlersInstalled = false;

export function installGlobalErrorHandlers() {
  if (globalHandlersInstalled || typeof window === "undefined") return;
  globalHandlersInstalled = true;

  window.addEventListener("error", (event) => {
    logger.error("Erro não tratado", event.error ?? event.message, {
      scope: "window",
      source: event.filename,
      line: event.lineno,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    logger.error("Promise rejeitada sem tratamento", event.reason, { scope: "window" });
  });
}
