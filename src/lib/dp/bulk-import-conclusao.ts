/**
 * Regra pura: um lote de importação está concluído quando, depois de aprovar as
 * páginas enviadas, não sobra nenhuma página pendente já vinculada a um
 * colaborador. Páginas pendentes sem vínculo ainda precisam de decisão manual,
 * então nesse caso o lote continua aberto na tela.
 */
export interface LinhaLote {
  id: string;
  status: string;
  matched_colaborador_id?: string | null;
}

export function loteConcluido(linhas: LinhaLote[], aprovados: string[]): boolean {
  const enviados = new Set(aprovados);
  return !linhas.some(
    (l) => l.status === "pending" && !!l.matched_colaborador_id && !enviados.has(l.id),
  );
}
