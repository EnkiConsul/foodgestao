/**
 * Folgas agendadas no cálculo de desligamento.
 *
 * Regra: uma folga agendada (dp_folgas, status "agendada") entra como
 * EXCEÇÃO DE JORNADA ZERO — dia sem trabalho —, nunca como abatimento de
 * banco de horas. O cadastro de folgas não confirma origem bancária
 * (tipo/origem/direito_origem não marcam banco de horas), então nenhum
 * saldo é inventado nem descontado aqui.
 *
 * Conflito — escala publicada mandando trabalhar (carga > 0) no mesmo dia
 * de uma folga agendada — é devolvido para revisão humana: nenhuma fonte
 * é escolhida em silêncio. Feriados não passam por aqui (seguem no
 * calendário de feriados do motor).
 */

export interface FolgaAgendada {
  data: string;
  tipo?: string | null;
  origem?: string | null;
  direito_origem?: string | null;
}

export interface MesclaFolgas {
  /** Exceções de jornada (escala + folgas como zero), prontas para o motor. */
  excecoes: { data: string; minutos: number }[];
  /** Datas com escala publicada de trabalho E folga agendada (revisão). */
  conflitos: string[];
  /** Folgas efetivamente consideradas como dia sem trabalho. */
  consideradas: string[];
}

export function mesclarFolgasAgendadas(
  excecoesEscala: { data: string; minutos: number }[],
  folgas: FolgaAgendada[],
): MesclaFolgas {
  const porData = new Map(excecoesEscala.map((e) => [e.data, Math.max(0, Math.round(e.minutos))]));
  const conflitos: string[] = [];
  const consideradas: string[] = [];
  const vistas = new Set<string>();
  for (const f of folgas) {
    const data = String(f.data).slice(0, 10);
    if (vistas.has(data)) continue;
    vistas.add(data);
    const escala = porData.get(data);
    if (escala !== undefined && escala > 0) {
      conflitos.push(data); // escala manda trabalhar e há folga: revisão humana
      continue;
    }
    if (escala === undefined) porData.set(data, 0); // escala zero no dia já cobre
    consideradas.push(data);
  }
  return {
    excecoes: [...porData.entries()].map(([data, minutos]) => ({ data, minutos })),
    conflitos: conflitos.sort(),
    consideradas: consideradas.sort(),
  };
}
