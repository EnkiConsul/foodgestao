import { supabase } from "@/integrations/supabase/client";

/**
 * Registro da assinatura eletrônica de um documento.
 *
 * A gravação é feita exclusivamente pelo servidor: enviamos apenas o
 * identificador do documento e o servidor confere empresa, titular, versão e
 * conteúdo do arquivo antes de registrar. Chamar duas vezes não gera duas
 * assinaturas.
 */
export async function assinarDocumento(documentoId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke("dp-documento-aceitar", {
    body: { documento_id: documentoId },
  });

  if (error) {
    const detalhe = await lerMensagem(error);
    throw new Error(detalhe ?? "Não foi possível registrar a assinatura");
  }

  const aceiteId = (data as { aceite_id?: string } | null)?.aceite_id;
  if (!aceiteId) throw new Error("Não foi possível registrar a assinatura");
  return aceiteId;
}

/** Recupera a frase de negócio devolvida pelo servidor, quando houver. */
async function lerMensagem(error: unknown): Promise<string | null> {
  const ctx = (error as { context?: unknown })?.context;
  if (ctx && typeof (ctx as Response).json === "function") {
    try {
      const corpo = await (ctx as Response).json();
      if (typeof corpo?.error === "string") return corpo.error;
    } catch {
      /* resposta sem corpo legível */
    }
  }
  const msg = (error as { message?: string })?.message;
  return msg && !/non-2xx/i.test(msg) ? msg : null;
}
