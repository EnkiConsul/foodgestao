/**
 * Regras puras do balão "Baixe o aplicativo" no portal do colaborador.
 *
 * O balão flutua acima do menu inferior (não empurra a página) e só aparece
 * quando não atrapalha: depois da caixa de cookies ser respondida, com o
 * teclado fechado e alguns segundos depois de a página abrir.
 */

export const CONVITE_DISPENSA_CHAVE = "portal-instalar-app-dispensado";
export const CONVITE_DISPENSA_DIAS = 14;
export const CONVITE_ATRASO_MS = 2000;
/** Diferença mínima entre a janela e a área visível para considerar o teclado aberto. */
const TECLADO_MIN_PX = 150;

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Lê o valor guardado ao fechar o balão. Aceita a marca antiga ("1"), gravada
 * antes de o balão voltar sozinho: conta como fechado agora, para respeitar
 * quem já tinha fechado.
 */
export function lerDispensaConvite(valor: string | null, agora: number): { dispensadoEm: number | null; migrar: boolean } {
  if (!valor) return { dispensadoEm: null, migrar: false };
  if (valor === "1") return { dispensadoEm: agora, migrar: true };
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) return { dispensadoEm: null, migrar: false };
  return { dispensadoEm: n, migrar: false };
}

/** Depois de fechado, o balão fica escondido por 14 dias. */
export function conviteDispensadoRecente(dispensadoEm: number | null, agora: number): boolean {
  if (dispensadoEm == null) return false;
  return agora - dispensadoEm < CONVITE_DISPENSA_DIAS * DIA_MS;
}

/** Teclado do celular aberto: a área visível encolhe bem abaixo da janela. */
export function tecladoAberto(alturaJanela: number, alturaVisivel: number | null | undefined): boolean {
  if (alturaVisivel == null || !Number.isFinite(alturaVisivel)) return false;
  return alturaJanela - alturaVisivel > TECLADO_MIN_PX;
}

export interface EstadoConvite {
  /** Aparelho sem o app instalado (celular). */
  oferecer: boolean;
  dispensadoRecente: boolean;
  cookiesRespondidos: boolean;
  teclado: boolean;
  atrasoConcluido: boolean;
}

/** Um aviso por vez: o balão só aparece quando nada mais disputa a base da tela. */
export function deveMostrarConvite(e: EstadoConvite): boolean {
  return e.oferecer && !e.dispensadoRecente && e.cookiesRespondidos && !e.teclado && e.atrasoConcluido;
}
