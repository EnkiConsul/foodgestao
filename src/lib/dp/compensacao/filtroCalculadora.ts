/** Filtro de unidade da calculadora do gestor: sempre pelo ID, nome só para exibição. */
export interface ColabFiltro { id: string; nome: string; ativo?: boolean | null; unidade_id?: string | null; unidade_nome?: string | null }

export interface UnidadeOpcao { id: string; nome: string }

export function unidadesDosColaboradores(colabs: ColabFiltro[]): UnidadeOpcao[] {
  const m = new Map<string, string>();
  colabs.forEach((c) => { if (c.ativo && c.unidade_id) m.set(c.unidade_id, c.unidade_nome || "SEM NOME"); });
  return [...m.entries()].map(([id, nome]) => ({ id, nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR") || a.id.localeCompare(b.id));
}

export function colaboradoresDaUnidade<T extends ColabFiltro>(colabs: T[], unidadeId: string): T[] {
  return colabs
    .filter((c) => c.ativo && (unidadeId === "todas" || c.unidade_id === unidadeId))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}
