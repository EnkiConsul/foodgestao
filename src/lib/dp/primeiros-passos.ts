/**
 * Primeiros passos aparecem enquanto a equipe ainda está sendo trazida:
 * empresa sem colaboradores, ou com fichas em conferência e toda a equipe
 * atual vinda dessas fichas (implantação em andamento).
 */
export function primeirosPassosVisivel(d: {
  colaboradores: number;
  fichasPendentes: number;
  criadosPelasFichas: number;
}): boolean {
  if (d.colaboradores === 0) return true;
  return d.fichasPendentes > 0 && d.colaboradores <= d.criadosPelasFichas;
}
