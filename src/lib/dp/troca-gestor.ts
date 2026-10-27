export type TrocaAdministrativa = { origem_registro?: string | null };

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