/**
 * Distribui `total` itens em linhas de no máximo `colunas`, equilibrando as
 * quantidades entre as linhas (evita última linha quase vazia) e devolve o
 * tamanho de cada linha. O excedente vai para as primeiras linhas.
 *
 * Ex.: 8 itens em 5 colunas → [4, 4]; 7 em 5 → [4, 3]; 8 em 3 → [3, 3, 2].
 */
export function distribuirLinhas(total: number, colunas: number): number[] {
  if (total <= 0 || colunas <= 0) return [];
  const linhas = Math.ceil(total / colunas);
  const base = Math.floor(total / linhas);
  const extra = total % linhas;
  return Array.from({ length: linhas }, (_, i) => base + (i < extra ? 1 : 0));
}
