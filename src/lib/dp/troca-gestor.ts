export type TrocaAdministrativa = { origem_registro?: string | null };

type DiaTroca = { data: string; pessoas: { colaborador_id: string; categoria: string; avulso_id?: string | null }[] };

/** Use the actual operational calendar, never invent a colleague's leave date. */
export function folgasDisponiveisTroca(dias: DiaTroca[], pessoaId: string, outraPessoaId: string, dataOriginal: string): string[] {
  return dias.filter(dia => dia.data !== dataOriginal &&
    dia.pessoas.some(p => p.colaborador_id === pessoaId && !p.avulso_id && ["folga_padrao", "folga_extra"].includes(p.categoria)) &&
    !dia.pessoas.some(p => p.colaborador_id === pessoaId && ["ferias", "atestado", "ausente"].includes(p.categoria)) &&
    dia.pessoas.some(p => p.colaborador_id === outraPessoaId && !p.avulso_id && ["fixo", "convocado_aceito", "atrasado", "saida_antecipada"].includes(p.categoria))
  ).map(dia => dia.data).filter((data, index, datas) => datas.indexOf(data) === index).sort();
}

/** Administrative authorization is never a participant signature. Legacy rows retain portal rules. */
export function trocaExigeTermo(troca: TrocaAdministrativa): boolean {
  return troca.origem_registro !== "gestor";
}

export type TrocaGestorInput = {
  companyId: string;
  solicitanteId: string;
  destinoId: string;
  dataOriginal: string;
  dataProposta: string;
  motivo: string;
  cienteDsr: boolean;
  notificar: boolean;
};

export type TrocaGestorPrevia = {
  riscos: { colaborador_id: string; nome: string; dias: number }[];
  em_admissao: boolean;
};

export function argsTrocaGestor(input: Omit<TrocaGestorInput, "motivo" | "cienteDsr" | "notificar">) {
  return { _company: input.companyId, _sol: input.solicitanteId, _dest: input.destinoId, _original: input.dataOriginal, _proposta: input.dataProposta };
}