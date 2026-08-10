/**
 * Normalização de fotos de produto do cardápio.
 * Padrão único da plataforma: quadrado 1:1, 1200x1200 px, WEBP.
 * O recorte é central (center-crop), preservando a área mais relevante da foto.
 */

export const PRODUCT_IMAGE_SIZE = 1200;
export const PRODUCT_IMAGE_ASPECT = "1:1";
export const PRODUCT_IMAGE_OUTPUT_TYPE = "image/webp";
const OUTPUT_QUALITY = 0.85;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível ler a imagem enviada."));
    };
    img.src = url;
  });
}

/**
 * Converte qualquer imagem válida em um arquivo 1200x1200 WEBP com recorte central.
 * Em caso de falha do canvas, retorna o arquivo original para não bloquear o upload.
 */
export async function normalizeProductImage(file: File): Promise<File> {
  try {
    const img = await loadImage(file);
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    if (!side) return file;

    const sx = (img.naturalWidth - side) / 2;
    const sy = (img.naturalHeight - side) / 2;
    const target = Math.min(PRODUCT_IMAGE_SIZE, Math.max(side, 400));

    const canvas = document.createElement("canvas");
    canvas.width = target;
    canvas.height = target;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, side, side, 0, 0, target, target);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, PRODUCT_IMAGE_OUTPUT_TYPE, OUTPUT_QUALITY),
    );
    if (!blob) return file;

    const base = file.name.replace(/\.[^.]+$/, "") || "produto";
    return new File([blob], `${base}.webp`, { type: PRODUCT_IMAGE_OUTPUT_TYPE });
  } catch {
    return file;
  }
}
