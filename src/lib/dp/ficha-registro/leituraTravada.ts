/**
 * Proteção contra leitura pendurada.
 *
 * O leitor grava o avanço das páginas a cada bloco, e a tabela atualiza
 * `updated_at` em toda gravação. Se nada muda por muito tempo, o envio não está
 * mais sendo lido: a tela sai da espera e oferece tentar novamente ou cancelar.
 */
export const LIMITE_SEM_RESPOSTA_MS = 120_000;

export function leituraTravada(
  imp: { status: string; updated_at?: string | null; created_at?: string | null },
  agora: number = Date.now(),
  limiteMs: number = LIMITE_SEM_RESPOSTA_MS,
): boolean {
  if (imp.status !== "processing") return false;
  const referencia = imp.updated_at ?? imp.created_at ?? null;
  const t = referencia ? Date.parse(referencia) : Number.NaN;
  if (!Number.isFinite(t)) return false;
  return agora - t > limiteMs;
}
