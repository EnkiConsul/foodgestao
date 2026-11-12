/**
 * Lotes de documentos (contracheque, ponto, atestado…) que ainda pedem
 * conferência. A janela de importação mostra estes lotes ANTES do campo de
 * envio, para a pessoa continuar o que já mandou em vez de reenviar o PDF.
 */

export interface LoteDocumento {
  id: string;
  status: string;
  tipo?: string | null;
  created_at: string;
  total_pages?: number | null;
  processed_pages?: number | null;
}

/** Lotes antigos esquecidos não ficam cobrando para sempre (seguem na lista). */
export const DIAS_LOTE_ABERTO = 60;

const EM_LEITURA = ["queued", "processing"];
const CONFERENCIA = ["ready", "partially_imported"];

export function loteEmLeitura(l: Pick<LoteDocumento, "status">): boolean {
  return EM_LEITURA.includes(l.status);
}

/**
 * Lotes em leitura ou com páginas a conferir, do mais recente para o mais
 * antigo, dentro da janela de dias. `pendentesPorLote` = páginas em "pending".
 */
export function lotesAbertos<T extends LoteDocumento>(
  lotes: readonly T[],
  pendentesPorLote: Record<string, number>,
  agora: Date = new Date(),
): T[] {
  const limite = agora.getTime() - DIAS_LOTE_ABERTO * 86_400_000;
  return lotes
    .filter((l) => new Date(l.created_at).getTime() >= limite)
    .filter((l) => loteEmLeitura(l) || (CONFERENCIA.includes(l.status) && (pendentesPorLote[l.id] ?? 0) > 0))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Quando a pessoa chega para enviar um tipo que já tem lote aberto, o envio começa recolhido. */
export function envioRecolhidoAoAbrir(
  abertos: readonly LoteDocumento[],
  tipoPedido: string | null | undefined,
): boolean {
  if (abertos.length === 0) return false;
  if (!tipoPedido) return true;
  return abertos.some((l) => l.tipo === tipoPedido);
}

/** Texto curto do lote aberto: "Lendo 3 de 12 páginas" ou "12 páginas para conferir". */
export function situacaoLoteAberto(l: LoteDocumento, pendentes: number): string {
  if (loteEmLeitura(l)) {
    const total = l.total_pages ?? 0;
    return total > 0 ? `Lendo ${l.processed_pages ?? 0} de ${total} páginas` : "Na fila de leitura";
  }
  return `${pendentes} ${pendentes === 1 ? "página para conferir" : "páginas para conferir"}`;
}
