/**
 * Extração das cores predominantes da logo enviada, para sugerir a cor
 * principal da loja online. Roda 100% no navegador (canvas).
 */

const SAMPLE_SIZE = 64;
/** Buckets de 32 níveis por canal — reduz milhões de cores a poucas dezenas. */
const QUANT = 32;

function hex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function luminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function saturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0) return 0;
  return (max - min) / max;
}

function distance(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Não foi possível ler a imagem da logo."));
    img.src = url;
  });
}

/**
 * Retorna até `max` cores hex da imagem, ordenadas por frequência.
 * Descarta pixels transparentes, quase-brancos, quase-pretos e cinzas.
 */
export async function extractLogoPalette(url: string, max = 6): Promise<string[]> {
  const img = await loadImage(url);
  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE_SIZE;
  canvas.height = SAMPLE_SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
  } catch {
    // Canvas "sujo" (imagem sem CORS) — sem paleta.
    return [];
  }

  const buckets = new Map<string, { sum: [number, number, number]; count: number }>();
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (a < 160) continue;
    const lum = luminance(r, g, b);
    if (lum > 0.92 || lum < 0.06) continue;
    if (saturation(r, g, b) < 0.18) continue;

    const key = `${Math.round(r / QUANT)}-${Math.round(g / QUANT)}-${Math.round(b / QUANT)}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.sum[0] += r;
      bucket.sum[1] += g;
      bucket.sum[2] += b;
      bucket.count += 1;
    } else {
      buckets.set(key, { sum: [r, g, b], count: 1 });
    }
  }

  const ranked = [...buckets.values()]
    .filter((b) => b.count >= 4)
    .sort((a, b) => b.count - a.count)
    .map((b) => [b.sum[0] / b.count, b.sum[1] / b.count, b.sum[2] / b.count] as [number, number, number]);

  // Agrupa tons parecidos para não repetir a mesma cor.
  const picked: [number, number, number][] = [];
  for (const color of ranked) {
    if (picked.some((p) => distance(p, color) < 48)) continue;
    picked.push(color);
    if (picked.length >= max) break;
  }

  return picked.map(([r, g, b]) => hex(r, g, b));
}
