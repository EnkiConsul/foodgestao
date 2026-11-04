// Quem pode receber um registro de ausência numa data: estava ativo no dia
// (admitido até a data e não desligado antes dela) e ainda não tem ausência.
export interface ColabAusencia {
  id: string;
  data_admissao?: string | null;
  data_desligamento?: string | null;
  deleted_at?: string | null;
  unidade_id?: string | null;
  folga_fixa_semana?: number | null;
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

/** Dia da semana (0=domingo) de uma data AAAA-MM-DD, sem fuso. */
export function diaSemana(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Motivos que só se aplicam a quem trabalharia no dia (nunca sócio, nunca quem folga). */
export const MOTIVOS_SO_ESCALADOS = ["falta", "suspensao"] as const;

export type GrupoAusencia = "escalados" | "folga" | "socios";

export interface OpcaoAusencia<T> {
  colab: T;
  grupo: GrupoAusencia;
  /** Motivo pelo qual não pode ser escolhido com o motivo atual. */
  bloqueio: string | null;
}

/**
 * Lista do seletor: só a unidade escolhida, agrupada em escalados, folga prevista
 * e sócios. Falta e suspensão bloqueiam sócios e quem tem folga habitual no dia.
 */
export function opcoesAusencia<T extends ColabAusencia>(
  colabs: T[],
  opts: { data: string; unidadeId: string | null; comAusencia: Set<string>; motivo: string; ehSocio: (c: T) => boolean },
): OpcaoAusencia<T>[] {
  if (!opts.unidadeId) return [];
  const dow = opts.data ? diaSemana(opts.data) : -1;
  const soEscalados = (MOTIVOS_SO_ESCALADOS as readonly string[]).includes(opts.motivo);
  return elegiveisParaAusencia(colabs, opts.data, opts.comAusencia)
    .filter((c) => c.unidade_id === opts.unidadeId)
    .map((c) => {
      if (opts.ehSocio(c)) {
        return { colab: c, grupo: "socios" as const, bloqueio: soEscalados ? "Não se aplica a sócio" : null };
      }
      if (c.folga_fixa_semana != null && c.folga_fixa_semana === dow) {
        return { colab: c, grupo: "folga" as const, bloqueio: soEscalados ? "Folga prevista neste dia" : null };
      }
      return { colab: c, grupo: "escalados" as const, bloqueio: null };
    });
}
