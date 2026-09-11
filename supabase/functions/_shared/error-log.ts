import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Registro de falhas das funções do servidor na Auditoria de erros.
 *
 * Grava o NOME DA FUNÇÃO na tela/origem, para que quem for corrigir saiba
 * exatamente onde procurar. Nunca lança: falhar ao registrar não pode
 * derrubar a função.
 */
export async function recordEdgeError(input: {
  /** Nome da função do servidor, ex.: "dp-doc-bulk-ingest". */
  functionName: string;
  /** Ação tentada, ex.: "importar documentos". */
  action?: string;
  error: unknown;
  companyId?: string | null;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return;

    const err = input.error as { message?: string; code?: string; stack?: string } | string | null;
    const message =
      typeof err === "string" ? err : (err?.message ?? "Erro desconhecido no servidor");
    const code = typeof err === "string" ? null : (err?.code ?? null);
    const stack = typeof err === "string" ? null : (err?.stack?.slice(0, 4000) ?? null);

    const normalized = String(message)
      .toLowerCase()
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "#id")
      .replace(/\d+/g, "#n")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 220);
    const fingerprint = [input.functionName, input.action ?? "-", code ?? "-", normalized].join("|");

    const supabase = createClient(url, key);
    await supabase.rpc("app_error_log_record", {
      _fingerprint: fingerprint,
      _message: String(message).slice(0, 2000),
      _company_id: input.companyId ?? null,
      _surface: `Servidor · ${input.functionName}`,
      _route: null,
      _action: input.action ?? null,
      _severity: "error",
      _source: "edge",
      _code: code,
      _user_message: null,
      _details: {
        ...(input.details ?? {}),
        funcao: input.functionName,
        ...(stack ? { stack } : {}),
      },
    });
  } catch {
    // silencioso por definição
  }
}
