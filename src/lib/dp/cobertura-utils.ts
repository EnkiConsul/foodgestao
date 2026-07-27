// ------------------------------------------------------------------
// Domínio: DP → Cobertura mínima por turno (Fase 6)
//
// Resolve, para uma data e unidade, quantas pessoas cada turno precisa ter.
// Funções puras — sem React, sem Supabase.
// ------------------------------------------------------------------

export interface RegraCobertura {
  id: string;
  unidade_id: string | null;
  cargo_id: string | null;
  dia_semana: number | null;
  turno_id: string | null;
  minimo: number;
  ativo: boolean;
  vigencia_inicio: string | null;
  vigencia_fim: string | null;
}

/** Dia da semana (0 = domingo) de uma data ISO, sem drift de fuso. */
export function diaSemanaDe(dataIso: string): number {
  return new Date(`${dataIso}T12:00:00`).getDay();
}

/** A regra está ativa e dentro da vigência na data informada? */
export function regraVigente(regra: RegraCobertura, dataIso: string): boolean {
  if (!regra.ativo) return false;
  if (regra.vigencia_inicio && dataIso < regra.vigencia_inicio) return false;
  if (regra.vigencia_fim && dataIso > regra.vigencia_fim) return false;
  return true;
}

export interface ResolverCoberturaInput {
  regras: RegraCobertura[];
  data: string;
  /** null = todas as unidades. */
  unidadeId?: string | null;
  /** Turnos considerados no dia (ids). */
  turnoIds: string[];
}

/**
 * Mínimo exigido por turno na data.
 * Regras sem turno valem para todos os turnos; a mais exigente prevalece.
 */
export function resolverCoberturaMinima(input: ResolverCoberturaInput): Record<string, number> {
  const { regras, data, unidadeId = null, turnoIds } = input;
  const dow = diaSemanaDe(data);
  const resultado: Record<string, number> = {};

  for (const regra of regras) {
    if (!regraVigente(regra, data)) continue;
    if (regra.dia_semana != null && regra.dia_semana !== dow) continue;
    if (regra.unidade_id && unidadeId && regra.unidade_id !== unidadeId) continue;

    const alvos = regra.turno_id ? [regra.turno_id] : turnoIds;
    for (const turnoId of alvos) {
      if (!turnoIds.includes(turnoId)) continue;
      resultado[turnoId] = Math.max(resultado[turnoId] ?? 0, regra.minimo);
    }
  }

  return resultado;
}

export interface CoberturaTurno {
  turno_id: string;
  nome: string;
  minimo: number;
  escalados: number;
  descoberto: number;
}

/** Compara o mínimo exigido com o número de escalados por turno. */
export function avaliarCobertura(
  turnos: { id: string; nome: string }[],
  escaladosPorTurno: Record<string, number>,
  minimos: Record<string, number>,
): CoberturaTurno[] {
  return turnos
    .filter((t) => minimos[t.id] != null)
    .map((t) => {
      const minimo = minimos[t.id] ?? 0;
      const escalados = escaladosPorTurno[t.id] ?? 0;
      return {
        turno_id: t.id,
        nome: t.nome,
        minimo,
        escalados,
        descoberto: Math.max(0, minimo - escalados),
      };
    })
    .sort((a, b) => b.descoberto - a.descoberto || a.nome.localeCompare(b.nome, "pt-BR"));
}
