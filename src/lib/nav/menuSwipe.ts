/**
 * Lógica pura do gesto vertical de navegação entre os menus principais.
 *
 * - Arrastar de baixo para cima ("cima") abre o próximo menu; a partir do
 *   Início abre o primeiro menu. No último menu o gesto não faz nada.
 * - Arrastar de cima para baixo ("baixo") volta ao menu anterior; do primeiro
 *   menu volta para o Início. Fora das telas de menu, nada acontece.
 */

export type DirecaoMenuVertical = "cima" | "baixo";

/**
 * Decide se o arrasto deve ser ignorado pela navegação.
 *
 * Toque iniciado dentro de uma área com rolagem própria (ex.: a lista de
 * Pendências no Início) nunca troca de menu, mesmo que a lista já esteja no
 * fim ou seja curta demais para rolar. A exceção é começar numa das bordas
 * verticais da tela, onde não há rolagem a roubar.
 */
export function gestoVerticalBloqueado(args: {
  /** O toque começou dentro de um contêiner com rolagem própria. */
  scrollerInterno: boolean;
  /** O toque começou na borda superior/inferior da tela. */
  comecouNaBorda: boolean;
  /** Ainda há rolagem restante do documento na direção do arrasto. */
  documentoComRolagemRestante: boolean;
}): boolean {
  if (args.comecouNaBorda) return false;
  if (args.scrollerInterno) return true;
  return args.documentoComRolagemRestante;
}

/** Índice da rota de menu que corresponde ao pathname atual, ou -1. */
export function indiceMenuAtual(rotas: string[], pathname: string): number {
  let melhor = -1;
  let tamanho = -1;
  rotas.forEach((rota, i) => {
    if (pathname === rota || pathname.startsWith(`${rota}/`)) {
      if (rota.length > tamanho) {
        tamanho = rota.length;
        melhor = i;
      }
    }
  });
  return melhor;
}

export function destinoMenuVertical(args: {
  rotas: string[];
  pathname: string;
  direcao: DirecaoMenuVertical;
  /** Rota da tela de Início do módulo. */
  homeTo: string;
}): string | null {
  const { rotas, pathname, direcao, homeTo } = args;
  if (rotas.length === 0) return null;
  const naHome = pathname === homeTo;
  const atual = indiceMenuAtual(rotas, pathname);

  if (direcao === "cima") {
    if (naHome) return rotas[0] ?? null;
    if (atual < 0) return null;
    return rotas[atual + 1] ?? null;
  }

  if (naHome) return null;
  if (atual < 0) return null;
  if (atual === 0) return homeTo;
  return rotas[atual - 1] ?? null;
}
