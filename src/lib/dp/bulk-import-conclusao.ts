/**
 * Regra pura: um lote de importação está concluído quando, depois de aprovar ou
 * ignorar as páginas enviadas, não sobra nenhuma página pendente. Páginas sem
 * colaborador vinculado também mantêm o lote aberto: a conferência mostra o que
 * já foi salvo e oferece criar o cadastro, escolher a pessoa ou concluir
 * ignorando essas páginas (ver `src/lib/dp/documentos/lote-parcial.ts`).
 */
export interface LinhaLote {
  id: string;
  status: string;
  matched_colaborador_id?: string | null;
}

export function loteConcluido(
  linhas: LinhaLote[],
  aprovados: string[],
  ignorados: string[] = [],
): boolean {
  const decididos = new Set([...aprovados, ...ignorados]);
  return !linhas.some((l) => l.status === "pending" && !decididos.has(l.id));
}
