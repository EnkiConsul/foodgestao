/**
 * Impressão digital (SHA-256) do conteúdo de um documento guardado no
 * armazenamento privado. Os bytes são lidos sempre no servidor: nenhum
 * caminho de arquivo nem resumo vindo do cliente é aceito como verdade.
 */
import { type SupabaseClient } from "npm:@supabase/supabase-js@2";

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Lê o arquivo do documento e devolve o resumo do conteúdo, gravando-o na
 * versão quando ainda não houver (ou quando o arquivo tiver sido substituído
 * em uma versão que ainda não foi aceita).
 */
export async function garantirHashDocumento(
  admin: SupabaseClient,
  bucket: string,
  documento: { id: string; file_path: string | null; arquivo_sha256?: string | null },
): Promise<{ hash: string | null; divergente: boolean }> {
  if (!documento.file_path) return { hash: null, divergente: false };

  // Uma nova tentativa cobre falha passageira do armazenamento.
  let baixar = await admin.storage.from(bucket).download(documento.file_path);
  if (baixar.error || !baixar.data) {
    await new Promise((r) => setTimeout(r, 800));
    baixar = await admin.storage.from(bucket).download(documento.file_path);
  }
  if (baixar.error || !baixar.data) {
    console.error("[doc-hash] download falhou", documento.id, baixar.error?.message);
    return { hash: null, divergente: false };
  }

  const hash = await sha256Hex(await baixar.data.arrayBuffer());
  const atual = documento.arquivo_sha256 ?? null;
  if (atual === hash) return { hash, divergente: false };

  const { error } = await admin
    .from("dp_documentos")
    .update({ arquivo_sha256: hash, arquivo_sha256_em: new Date().toISOString() })
    .eq("id", documento.id);
  if (error) {
    console.error("[doc-hash] gravação do resumo falhou", documento.id, error.message);
    // Sem resumo anterior, o calculado agora é o do arquivo — não trava a assinatura.
    return atual ? { hash: atual, divergente: true } : { hash: null, divergente: false };
  }

  return { hash, divergente: !!atual };
}
