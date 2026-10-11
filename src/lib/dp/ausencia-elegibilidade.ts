// Quem pode receber um registro de ausência numa data: estava ativo no dia
// (admitido até a data e não desligado antes dela) e ainda não tem ausência.
export interface ColabAusencia {
  id: string;
  data_admissao?: string | null;
  data_desligamento?: string | null;
  deleted_at?: string | null;
}

/** Ativo na data: admitido até ela e desligado só depois dela (ou no próprio dia). */
export function ativoNaData(c: ColabAusencia, iso: string): boolean {
  if (!iso || c.deleted_at) return false;
  if (c.data_admissao && c.data_admissao > iso) return false;
  if (c.data_desligamento && c.data_desligamento < iso) return false;
  return true;
}

export function elegiveisParaAusencia<T extends ColabAusencia>(colabs: T[], iso: string, comAusencia: Set<string>): T[] {
  return colabs.filter((c) => ativoNaData(c, iso) && !comAusencia.has(c.id));
}
