export type TrocaAdministrativa = { origem_registro?: string | null };

type DiaTroca = { data: string; pessoas: { colaborador_id: string; categoria: string; avulso_id?: string | null }[] };

/** Use the actual operational calendar, never invent a colleague's leave date. */
export function folgasDisponiveisTroca(dias: DiaTroca[], pessoaId: string, outraPessoaId: string, dataOriginal: string, dataMinima?: string): string[] {
  return dias.filter(dia => dia.data !== dataOriginal && (!dataMinima || dia.data >= dataMinima) &&
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

/** Plantão 12x36 que ficaria colado a outro plantão (D e D+1) depois da troca. */
export type RiscoPlantao12x36 = { colaborador_id: string; nome: string; data_plantao: string; data_vizinha: string };

export type TrocaGestorPrevia = {
  riscos: { colaborador_id: string; nome: string; dias: number }[];
  riscos_12x36?: RiscoPlantao12x36[];
  em_admissao: boolean;
  participantes?: ParticipanteTermoTroca[];
};

export type ParticipanteTermoTroca = { colaborador_id: string; nome: string; formal: boolean; portal: boolean; data_original: string; data_nova: string; empresa: string };

/** Terms are individual GED documents; administrative authorization never becomes consent. */
export function participantesComTermo(participantes: ParticipanteTermoTroca[]): ParticipanteTermoTroca[] {
  return participantes.filter(p => p.formal);
}

export function argsTrocaGestor(input: Omit<TrocaGestorInput, "motivo" | "cienteDsr" | "notificar">) {
  return { _company: input.companyId, _sol: input.solicitanteId, _dest: input.destinoId, _original: input.dataOriginal, _proposta: input.dataProposta };
}
/** Real future days off of one person, offered as tap options (no manual date typing). */
export function folgasPropriasTroca(dias: DiaTroca[], pessoaId: string, dataMinima?: string): string[] {
  return dias.filter(dia => (!dataMinima || dia.data >= dataMinima) &&
    dia.pessoas.some(p => p.colaborador_id === pessoaId && !p.avulso_id && ["folga_padrao", "folga_extra"].includes(p.categoria))
  ).map(dia => dia.data).filter((data, index, datas) => datas.indexOf(data) === index).sort();
}

/** Motivo mínimo exigido pelo servidor quando a troca cola plantões 12x36. */
export const MOTIVO_MIN_PLANTAO_12X36 = 10;

/** Plantões seguidos de uma pessoa, agrupados para o termo e para o aviso. */
export function plantoesSeguidosDe(riscos: RiscoPlantao12x36[] | null | undefined, colaboradorId: string): RiscoPlantao12x36[] {
  return (riscos ?? []).filter((r) => r.colaborador_id === colaboradorId);
}
