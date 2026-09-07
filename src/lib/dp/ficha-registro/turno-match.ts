/**
 * Correspondência entre o horário lido na ficha e os turnos já cadastrados na
 * empresa. Cada ficha é avaliada isoladamente — nada é aplicado em bloco.
 */

import type { JornadaSugerida } from "./jornada-parse";

export interface TurnoCadastrado {
  id: string;
  nome: string;
  entrada: string;
  saida: string;
  intervalo_minutos?: number | null;
  unidade_id?: string | null;
  ativo?: boolean | null;
}

export interface TurnoMatch {
  turno_id: string | null;
  turno_nome: string | null;
  /** Entrada e saída predominantes na ficha (podem não bater com nenhum turno). */
  entrada: string | null;
  saida: string | null;
  intervalo_minutos: number | null;
}

const hhmm = (v: string | null | undefined) => String(v ?? "").slice(0, 5);

/** Horário mais frequente entre os dias trabalhados da ficha. */
export function horarioPredominante(jornada: JornadaSugerida) {
  const contagem = new Map<string, { n: number; entrada: string; saida: string; intervalo: number }>();
  for (const d of jornada.dias) {
    if (!d.trabalha || !d.entrada || !d.saida) continue;
    const chave = `${hhmm(d.entrada)}-${hhmm(d.saida)}-${d.intervalo_minutos ?? 0}`;
    const atual = contagem.get(chave);
    if (atual) atual.n += 1;
    else contagem.set(chave, { n: 1, entrada: hhmm(d.entrada), saida: hhmm(d.saida), intervalo: d.intervalo_minutos ?? 0 });
  }
  const melhor = [...contagem.values()].sort((a, b) => b.n - a.n)[0];
  return melhor ?? null;
}

export function matchTurno(
  jornada: JornadaSugerida,
  turnos: TurnoCadastrado[],
  unidadeId?: string | null,
): TurnoMatch {
  const base = horarioPredominante(jornada);
  if (!base) return { turno_id: null, turno_nome: null, entrada: null, saida: null, intervalo_minutos: null };

  const candidatos = turnos.filter(
    (t) => t.ativo !== false && (!unidadeId || !t.unidade_id || t.unidade_id === unidadeId),
  );
  const iguais = candidatos.filter((t) => hhmm(t.entrada) === base.entrada && hhmm(t.saida) === base.saida);
  const comIntervalo = iguais.find((t) => (t.intervalo_minutos ?? 0) === base.intervalo);
  const escolhido = comIntervalo ?? iguais[0] ?? null;

  return {
    turno_id: escolhido?.id ?? null,
    turno_nome: escolhido?.nome ?? null,
    entrada: base.entrada,
    saida: base.saida,
    intervalo_minutos: base.intervalo,
  };
}
