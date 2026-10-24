import { supabase } from "@/integrations/supabase/client";
import { abrirNoApp } from "@/lib/visualizadorGlobal";

export const DP_DOCUMENTOS_BUCKET = "dp-documentos";

export type ArquivoAutorizado = {
  file_path: string;
  file_name: string | null;
  mime_type: string | null;
};

/**
 * Autorização primeiro, arquivo depois: o caminho no Storage só é conhecido
 * depois que o servidor confirma que a pessoa logada pode ver aquele
 * documento (empresa, vínculo e papel). Nenhuma tela monta o caminho sozinha.
 */
export type VarianteArquivo = "documento" | "comprovante";

export async function arquivoAutorizado(
  documentoId: string,
  variante: VarianteArquivo = "documento",
): Promise<ArquivoAutorizado | null> {
  const { data, error } = await supabase.rpc("dp_documento_arquivo", {
    _documento_id: documentoId,
    _variante: variante,
  } as never);
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.file_path) return null;
  return row as ArquivoAutorizado;
}

/** Link temporário para o documento, válido apenas por poucos instantes. */
export async function linkDocumentoAssinado(
  documentoId: string,
  segundos = 60,
  variante: VarianteArquivo = "documento",
): Promise<{ url: string; fileName: string | null; mimeType: string | null } | null> {
  const arquivo = await arquivoAutorizado(documentoId, variante);
  if (!arquivo) return null;
  const { data, error } = await supabase.storage
    .from(DP_DOCUMENTOS_BUCKET)
    .createSignedUrl(arquivo.file_path, segundos);
  if (error || !data) return null;
  return { url: data.signedUrl, fileName: arquivo.file_name, mimeType: arquivo.mime_type ?? null };
}

/** Abre o documento no visualizador do app; com `download`, só baixa. Nada abre em outra aba. */
export async function abrirDocumento(
  documentoId: string,
  opts: { download?: boolean; segundos?: number; variante?: VarianteArquivo; titulo?: string } = {},
): Promise<boolean> {
  const link = await linkDocumentoAssinado(documentoId, opts.segundos ?? 120, opts.variante ?? "documento");
  if (!link) return false;
  if (!opts.download && abrirNoApp({ titulo: opts.titulo ?? link.fileName ?? "Documento", url: link.url, mime: link.mimeType, nome: link.fileName })) {
    return true;
  }
  const r = await fetch(link.url);
  if (!r.ok) return false;
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = link.fileName ?? "documento";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return true;
}
