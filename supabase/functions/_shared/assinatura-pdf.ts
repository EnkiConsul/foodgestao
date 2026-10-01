/**
 * Imagem da assinatura (desenhada ou em letra cursiva) estampada nos PDFs:
 * assinatura completa no bloco de encerramento e rubrica compacta em todas as
 * páginas. A imagem é só a representação visual; a prova jurídica continua
 * sendo identificação + data/hora + IP + hash do conteúdo.
 */
import { rgb, type PDFDocument, type PDFFont, type PDFImage, type PDFPage } from "npm:pdf-lib@1.17.1";

const PREFIXO = "data:image/png;base64,";
export const ASSINATURA_MAX_CHARS = 400_000;

/** Aceita só PNG em data URL dentro do limite; qualquer outra coisa vira null. */
export function assinaturaValida(v: unknown): string | null {
  if (typeof v !== "string") return null;
  if (!v.startsWith(PREFIXO) || v.length > ASSINATURA_MAX_CHARS) return null;
  const b64 = v.slice(PREFIXO.length);
  if (!/^[A-Za-z0-9+/=]+$/.test(b64)) return null;
  // Assinatura PNG: começa com a assinatura de arquivo PNG.
  try {
    const head = atob(b64.slice(0, 12));
    if (head.charCodeAt(1) !== 0x50 || head.charCodeAt(2) !== 0x4e || head.charCodeAt(3) !== 0x47) return null;
  } catch {
    return null;
  }
  return v;
}

export async function embutirAssinatura(pdf: PDFDocument, dataUrl: string | null | undefined): Promise<PDFImage | null> {
  const v = assinaturaValida(dataUrl);
  if (!v) return null;
  try {
    const bruto = atob(v.slice(PREFIXO.length));
    const bytes = new Uint8Array(bruto.length);
    for (let i = 0; i < bruto.length; i++) bytes[i] = bruto.charCodeAt(i);
    return await pdf.embedPng(bytes);
  } catch {
    return null;
  }
}

/** Desenha a imagem dentro da caixa, mantendo a proporção, alinhada à base. */
export function desenharAssinatura(page: PDFPage, img: PDFImage, x: number, y: number, maxL: number, maxA: number) {
  const escala = Math.min(maxL / img.width, maxA / img.height);
  page.drawImage(img, { x, y, width: img.width * escala, height: img.height * escala });
}

/** Rubrica compacta no canto inferior direito de cada página, acima do rodapé. */
export function rubricarPaginas(pdf: PDFDocument, img: PDFImage, fonte: PDFFont, baseY = 44) {
  for (const page of pdf.getPages()) {
    const { width } = page.getSize();
    const maxL = 70;
    const maxA = 26;
    const escala = Math.min(maxL / img.width, maxA / img.height);
    const w = img.width * escala;
    const x = width - 24 - maxL;
    page.drawImage(img, { x: x + (maxL - w), y: baseY + 8, width: w, height: img.height * escala });
    const rot = "Rubrica Digital";
    page.drawText(rot, {
      x: width - 24 - fonte.widthOfTextAtSize(rot, 5.5), y: baseY, size: 5.5, font: fonte, color: rgb(0.45, 0.45, 0.45),
    });
  }
}
