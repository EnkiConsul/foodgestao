/**
 * Política de envio de arquivos por repositório (bucket).
 *
 * O servidor de armazenamento já recusa arquivos acima do limite de tamanho
 * configurado em cada bucket. Aqui repetimos o limite e acrescentamos os tipos
 * aceitos, para recusar antes de consumir rede e devolver mensagem clara.
 */

import { converterHeicParaJpeg } from "@/lib/storage/heic";


export type UploadPolicy = {
  /** Limite em megabytes, igual ao configurado no bucket. */
  maxMB: number;
  /** Tipos MIME aceitos. */
  mimes: string[];
  /** Descrição dos formatos, usada na mensagem de erro. */
  formatos: string;
};

// Inclui formatos de câmera de celular (HEIC/HEIF do iPhone) e digitalizações
// (GIF/BMP/TIFF), que os seletores de arquivo "image/*" oferecem.
const PDF_E_IMAGENS = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
  "image/gif",
  "image/bmp",
  "image/tiff",
];
const SOMENTE_IMAGENS = ["image/jpeg", "image/png", "image/webp"];

export const UPLOAD_POLICIES: Record<string, UploadPolicy> = {
  "dp-documentos": { maxMB: 15, mimes: PDF_E_IMAGENS, formatos: "PDF, JPG, PNG ou WEBP" },
  "dp-disciplinar": { maxMB: 15, mimes: PDF_E_IMAGENS, formatos: "PDF, JPG, PNG ou WEBP" },
  "dp-bulk-import": { maxMB: 25, mimes: ["application/pdf"], formatos: "PDF" },
  "transaction-attachments": {
    maxMB: 10,
    mimes: [
      ...PDF_E_IMAGENS,
      "text/csv",
      "text/plain",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
    formatos: "PDF, imagem, documento de texto ou planilha",
  },
  "ped-produtos": { maxMB: 5, mimes: SOMENTE_IMAGENS, formatos: "JPG, PNG ou WEBP" },
  "ped-storefront": { maxMB: 5, mimes: SOMENTE_IMAGENS, formatos: "JPG, PNG ou WEBP" },
};

/** Retorna a mensagem de erro quando o arquivo não é aceito, ou `null`. */
export function checarUpload(bucket: string, file: File): string | null {
  const pol = UPLOAD_POLICIES[bucket];
  if (!pol) return null;
  if (file.size === 0) return "Arquivo vazio. Escolha outro arquivo.";
  if (file.size > pol.maxMB * 1024 * 1024) {
    return `Arquivo acima do limite de ${pol.maxMB} MB.`;
  }
  const tipo = (file.type || "").toLowerCase();
  if (tipo && !pol.mimes.includes(tipo)) {
    return `Formato não aceito. Envie ${pol.formatos}.`;
  }
  return null;
}

/** Valida e interrompe o envio com mensagem amigável quando o arquivo é recusado. */
export function validarUpload(bucket: string, file: File): void {
  const erro = checarUpload(bucket, file);
  if (erro) throw new Error(erro);
}

/**
 * Prepara o arquivo para envio: converte foto de iPhone (HEIC/HEIF) em JPEG e
 * só então valida tamanho e formato. Use no lugar de `validarUpload`.
 */
export async function prepararUpload(bucket: string, file: File): Promise<File> {
  const pronto = await converterHeicParaJpeg(file);
  validarUpload(bucket, pronto);
  return materializarArquivo(pronto);
}

/**
 * Copia os bytes do arquivo para a memória antes do envio. No Android, arquivos
 * exportados por outros apps (ex.: CNH Digital) chegam como leitura temporária
 * que o sistema corta no meio do envio ("Failed to fetch").
 */
export async function materializarArquivo(file: File): Promise<File> {
  try {
    const buf = await file.arrayBuffer();
    return new File([buf], file.name, {
      type: file.type || "application/octet-stream",
      lastModified: file.lastModified,
    });
  } catch {
    throw new Error(
      "Não foi possível ler o arquivo no celular. Salve o arquivo na pasta Downloads ou envie uma foto e tente novamente.",
    );
  }
}

/** Repete operações de envio que falham por queda momentânea de rede. */
export async function comRetentativa<T>(fn: () => Promise<T>, tentativas = 3): Promise<T> {
  let ultimo: unknown;
  for (let i = 0; i < tentativas; i++) {
    try {
      return await fn();
    } catch (e: any) {
      ultimo = e;
      const msg = String(e?.message ?? e ?? "");
      const rede = /fetch|network|timeout|load failed/i.test(msg) || e?.name === "StorageUnknownError";
      if (!rede || i === tentativas - 1) throw e;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw ultimo;
}
