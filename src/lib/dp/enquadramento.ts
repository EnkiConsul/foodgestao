/** No retrato, a margem externa à guia pode ser preenchida com fundo claro. */
export function limitarPanEnquadramento(
  pan: { x: number; y: number },
  imagem: { w: number; h: number },
  quadro: { w: number; h: number },
  retrato: boolean,
) {
  const larguraProtegida = quadro.w * (retrato ? 0.64 : 1);
  const mx = Math.max(0, (imagem.w - larguraProtegida) / 2);
  const my = Math.max(0, (imagem.h - quadro.h) / 2);
  return { x: Math.min(mx, Math.max(-mx, pan.x)), y: Math.min(my, Math.max(-my, pan.y)) };
}