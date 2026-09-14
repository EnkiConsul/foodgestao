import { supabase } from "@/integrations/supabase/client";

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
export async function arquivoAutorizado(documentoId: string): Promise<ArquivoAutorizado | null> {
  const { data, error } = await supabase.rpc("dp_documento_arquivo", {
    _documento_id: documentoId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.file_path) return null;
  return row as ArquivoAutorizado;
}

/** Link temporário para o documento, válido apenas por poucos instantes. */
export async function linkDocumentoAssinado(
  documentoId: string,
  segundos = 60,
): Promise<{ url: string; fileName: string | null } | null> {
  const arquivo = await arquivoAutorizado(documentoId);
  if (!arquivo) return null;
  const { data, error } = await supabase.storage
    .from(DP_DOCUMENTOS_BUCKET)
    .createSignedUrl(arquivo.file_path, segundos);
  if (error || !data) return null;
  return { url: data.signedUrl, fileName: arquivo.file_name };
}

/** Abre (ou baixa) o documento em nova aba usando link temporário. */
export async function abrirDocumento(
  documentoId: string,
  opts: { download?: boolean; segundos?: number } = {},
): Promise<boolean> {
  const link = await linkDocumentoAssinado(documentoId, opts.segundos ?? 60);
  if (!link) return false;
  const a = document.createElement("a");
  a.href = link.url;
  a.target = "_blank";
  a.rel = "noopener";
  if (opts.download) a.download = link.fileName ?? "";
  document.body.appendChild(a);
  a.click();
  a.remove();
  return true;
}
