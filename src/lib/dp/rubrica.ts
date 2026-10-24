/**
 * Rubrica página a página na assinatura de documentos do portal.
 *
 * Documentos com mais de uma folha exigem que o colaborador confirme cada
 * página individualmente antes de concluir a assinatura. Assim fica provado
 * que ele passou por todo o conteúdo — ninguém assina "a folha de trás no
 * escuro". Documento de uma página só (ou imagem) não precisa de rubrica:
 * a assinatura completa já cobre a folha inteira.
 */

/** Rubrica é obrigatória somente quando há mais de uma página. */
export function rubricaObrigatoria(totalPaginas: number): boolean {
  return totalPaginas > 1;
}

/**
 * A assinatura final só é liberada com a assinatura feita e, quando a
 * rubrica é obrigatória, todas as páginas confirmadas uma a uma.
 */
export function podeConcluirAssinatura(
  temAssinatura: boolean,
  totalPaginas: number,
  paginasRubricadas: number,
): boolean {
  if (!temAssinatura) return false;
  if (!rubricaObrigatoria(totalPaginas)) return true;
  return paginasRubricadas >= totalPaginas;
}

/** Primeira página ainda sem rubrica, para guiar o colaborador na leitura. */
export function proximaPaginaSemRubrica(
  totalPaginas: number,
  rubricadas: ReadonlySet<number>,
): number | null {
  for (let n = 1; n <= totalPaginas; n++) {
    if (!rubricadas.has(n)) return n;
  }
  return null;
}
