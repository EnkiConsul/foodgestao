/**
 * Recibo de pagamento em dinheiro (espécie).
 *
 * Dois caminhos, ambos no servidor (`dp-recibo-especie`):
 *   • baixar o recibo para imprimir e assinar à mão;
 *   • guardar no acervo do colaborador pedindo assinatura no portal.
 */
import { supabase } from "@/integrations/supabase/client";

async function fraseDoErro(error: unknown, fallback: string): Promise<string> {
  const ctx = (error as { context?: Response } | null)?.context;
  if (ctx && typeof ctx.json === "function") {
    const corpo = (await ctx.json().catch(() => null)) as { error?: string } | null;
    if (corpo?.error) return corpo.error;
  }
  return fallback;
}

/** PDF do recibo para leitura/impressão. Devolve endereço temporário. */
export async function reciboEspeciePdf(
  documentoId: string,
): Promise<{ url: string; revogar: () => void }> {
  const { data, error } = await supabase.functions.invoke("dp-recibo-especie", {
    body: { documento_id: documentoId, registrar: false },
  });
  if (error) throw new Error(await fraseDoErro(error, "Não foi possível emitir o recibo agora."));
  const blob = data instanceof Blob
    ? data
    : new Blob([data as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  return { url, revogar: () => URL.revokeObjectURL(url) };
}

/** Guarda o recibo no acervo do colaborador exigindo assinatura no portal. */
export async function emitirReciboEspecieParaAssinatura(documentoId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke("dp-recibo-especie", {
    body: { documento_id: documentoId, registrar: true },
  });
  if (error) throw new Error(await fraseDoErro(error, "Não foi possível emitir o recibo agora."));
  const corpo = data as { recibo_documento_id?: string } | null;
  if (!corpo?.recibo_documento_id) throw new Error("O recibo não pôde ser registrado.");
  return corpo.recibo_documento_id;
}
