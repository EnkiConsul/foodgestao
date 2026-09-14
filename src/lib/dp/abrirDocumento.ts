// ------------------------------------------------------------------
// Abertura de arquivos do DP no navegador.
//
// Documentos antigos foram gravados sem o tipo do arquivo, o que faz o
// celular tratar o PDF como download genérico (ou mandar para a impressora).
// Aqui o arquivo é baixado e reaberto com o tipo correto, sempre em uma nova
// aba, para que o visualizador de PDF do aparelho assuma.
// ------------------------------------------------------------------

import { supabase } from "@/integrations/supabase/client";

/** Tipo do arquivo pela extensão, quando o registro não guardou essa informação. */
export function tipoPelaExtensao(nome?: string | null): string {
  const ext = (nome ?? "").toLowerCase().split(".").pop() ?? "";
  switch (ext) {
    case "pdf":
      return "application/pdf";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "heic":
      return "image/heic";
    case "txt":
      return "text/plain";
    default:
      return "application/octet-stream";
  }
}

export type AbrirArquivoParams = {
  bucket: string;
  path: string;
  mimeType?: string | null;
  fileName?: string | null;
};

export type AbrirArquivoResultado = {
  ok: boolean;
  motivo?: "sem_arquivo" | "sem_permissao" | "bloqueado" | "erro";
  erro?: unknown;
};

/** Abre o arquivo em nova aba com o tipo correto. Nunca dispara impressão. */
export async function abrirArquivoDp({
  bucket,
  path,
  mimeType,
  fileName,
}: AbrirArquivoParams): Promise<AbrirArquivoResultado> {
  if (!path) return { ok: false, motivo: "sem_arquivo" };
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) {
    const status = (error as { statusCode?: string | number } | null)?.statusCode;
    const negado = String(status ?? "") === "403" || String(status ?? "") === "400";
    return { ok: false, motivo: negado ? "sem_permissao" : "erro", erro: error };
  }
  const tipo =
    mimeType && mimeType !== "application/octet-stream" ? mimeType : tipoPelaExtensao(fileName ?? path);
  const url = URL.createObjectURL(new Blob([data], { type: tipo }));
  const win = window.open(url, "_blank", "noopener");
  if (!win) {
    URL.revokeObjectURL(url);
    return { ok: false, motivo: "bloqueado" };
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return { ok: true };
}
