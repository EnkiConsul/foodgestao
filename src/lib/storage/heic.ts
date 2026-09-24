/**
 * Fotos tiradas no iPhone chegam em HEIC/HEIF, que a maioria dos navegadores
 * não exibe. Convertemos para JPEG no próprio aparelho antes do envio, para o
 * arquivo guardado abrir em qualquer navegador.
 */

const HEIC_MIMES = new Set([
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);

/** Indica se o arquivo é uma foto HEIC/HEIF (por tipo ou extensão). */
export function ehHeic(file: File): boolean {
  const tipo = (file.type || "").toLowerCase();
  if (HEIC_MIMES.has(tipo)) return true;
  return /\.(heic|heif)$/i.test(file.name || "");
}

/** Converte HEIC/HEIF em JPEG; devolve o arquivo original nos outros casos. */
export async function converterHeicParaJpeg(file: File): Promise<File> {
  if (!ehHeic(file)) return file;
  try {
    const { default: heic2any } = await import("heic2any");
    const saida = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
    const blob = Array.isArray(saida) ? saida[0] : saida;
    const nome = (file.name || "foto").replace(/\.(heic|heif)$/i, "") + ".jpg";
    return new File([blob as Blob], nome, {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } catch {
    throw new Error(
      "Não foi possível converter a foto do iPhone. Salve como JPG ou tire a foto novamente.",
    );
  }
}
