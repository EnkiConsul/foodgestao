/** Limite de pixels por canvas aceito com folga por Android e iOS. */
const MAX_PIXELS = 16_000_000;
const MAX_LADO = 8192;

/**
 * Densidade de pixels do canvas do PDF: acompanha a tela (até 3×) e cai só o
 * necessário para o canvas caber no limite do aparelho — acima dele o celular
 * desenha a página em branco ou esticada.
 */
export function densidadeSegura(
  larguraCss: number,
  alturaCss: number,
  dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1,
): number {
  const alvo = Math.min(Math.max(dpr, 1), 3);
  const porArea = Math.sqrt(MAX_PIXELS / Math.max(1, larguraCss * alturaCss));
  const porLado = MAX_LADO / Math.max(1, larguraCss, alturaCss);
  return Math.max(0.5, Math.min(alvo, porArea, porLado));
}
