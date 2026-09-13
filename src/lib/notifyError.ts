import { toast } from "sonner";
import { reportError } from "@/lib/errorLog";

/**
 * Falhas em linguagem clara + registro na Auditoria de erros.
 *
 * Regra da casa: o usuário nunca vê texto técnico do servidor ("record new has
 * no field...", "violates constraint..."). Quando a falha não tem tradução
 * conhecida, mostramos uma frase acolhedora, registramos o erro técnico e o
 * aviso com o botão "Relatar problema" aparece automaticamente (o
 * `reportError` dispara o fluxo do ErrorReportCenter).
 *
 * Uso:
 *   notifyError(e, { surface: "Convocações", action: "publicar convocação" });
 *   notifyError(e, { surface: "Férias", action: "salvar regra", fallback: "Não foi possível salvar a regra." });
 */
export type NotifyErrorOptions = {
  /** Tela/módulo: "Convocações", "Férias", "Documentos"... */
  surface: string;
  /** O que a pessoa tentava fazer: "publicar convocação". */
  action: string;
  /** Texto amigável exibido. Padrão: "Não foi possível <action>. Tente novamente." */
  fallback?: string;
  /** Contexto extra gravado na auditoria (ids, competência...). */
  details?: Record<string, unknown>;
  /** Quando true, não registra (erros esperados/validação). */
  silenciar?: boolean;
};

function textoAmigavel(opts: NotifyErrorOptions): string {
  if (opts.fallback) return opts.fallback;
  return `Não foi possível ${opts.action}. Tente novamente — se continuar, relate o problema.`;
}

export function notifyError(error: unknown, opts: NotifyErrorOptions): void {
  toast.error(textoAmigavel(opts), { closeButton: true, duration: 10_000 });
  if (!opts.silenciar) {
    void reportError({
      error,
      surface: opts.surface,
      action: opts.action,
      userMessage: textoAmigavel(opts),
      details: opts.details,
    });
  }
}
