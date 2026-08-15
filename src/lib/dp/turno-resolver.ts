// ------------------------------------------------------------------
// Domínio: DP → resolver horário digitado no cadastro do colaborador
// em um "horário da loja" (turno) compartilhado.
//
// O empresário digita entrada/saída/intervalo. O sistema reaproveita um
// horário igual já existente na unidade ou cria um novo em silêncio.
// Funções puras — sem React, sem Supabase.
// ------------------------------------------------------------------

import { hhmm } from "@/lib/dp/jornada-utils";
import { nomeSugeridoTurno, sugerirCategoria, type TurnoHorario } from "@/lib/dp/turno-utils";

export interface HorarioSimples {
  entrada: string;
  saida: string;
  intervalo_minutos: number;
}

export interface TurnoCandidato extends TurnoHorario {
  id: string;
  nome: string;
  unidade_id?: string | null;
  ativo?: boolean;
}

function mesmoHorario(a: HorarioSimples, b: TurnoHorario): boolean {
  return hhmm(a.entrada) === hhmm(b.entrada)
    && hhmm(a.saida) === hhmm(b.saida)
    && Math.max(0, a.intervalo_minutos || 0) === Math.max(0, b.intervalo_minutos || 0);
}

/** Turno já cadastrado com exatamente o mesmo horário (na unidade, quando informada). */
export function encontrarTurnoEquivalente(
  horario: HorarioSimples,
  turnos: TurnoCandidato[],
  unidadeId?: string | null,
): TurnoCandidato | null {
  const candidatos = turnos.filter((t) => t.ativo !== false);
  const naUnidade = unidadeId
    ? candidatos.filter((t) => !t.unidade_id || t.unidade_id === unidadeId)
    : candidatos;
  return naUnidade.find((t) => mesmoHorario(horario, t)) ?? null;
}

export interface NovoTurnoSugerido {
  nome: string;
  categoria: string;
  entrada: string;
  saida: string;
  intervalo_minutos: number;
  unidade_id: string | null;
}

/** Dados do horário da loja a ser criado automaticamente a partir do que foi digitado. */
export function sugerirNovoTurno(
  horario: HorarioSimples,
  unidadeId?: string | null,
  labels?: Record<string, string> | null,
): NovoTurnoSugerido {
  const entrada = hhmm(horario.entrada);
  const saida = hhmm(horario.saida);
  const categoria = sugerirCategoria(entrada);
  return {
    nome: nomeSugeridoTurno(categoria, entrada, saida, labels),
    categoria,
    entrada,
    saida,
    intervalo_minutos: Math.max(0, horario.intervalo_minutos || 0),
    unidade_id: unidadeId ?? null,
  };
}

export type ResolucaoTurno =
  | { tipo: "reaproveita"; turno: TurnoCandidato }
  | { tipo: "cria"; novo: NovoTurnoSugerido };

/** Decide entre reaproveitar um horário existente e criar um novo. */
export function resolverTurnoDoHorario(
  horario: HorarioSimples,
  turnos: TurnoCandidato[],
  unidadeId?: string | null,
  labels?: Record<string, string> | null,
): ResolucaoTurno {
  const existente = encontrarTurnoEquivalente(horario, turnos, unidadeId);
  if (existente) return { tipo: "reaproveita", turno: existente };
  return { tipo: "cria", novo: sugerirNovoTurno(horario, unidadeId, labels) };
}

/** Horários distintos já usados na unidade — viram atalhos na tela do colaborador. */
export function atalhosDeHorario(turnos: TurnoCandidato[]): TurnoCandidato[] {
  const vistos = new Set<string>();
  const out: TurnoCandidato[] = [];
  for (const t of turnos) {
    if (t.ativo === false) continue;
    const chave = `${hhmm(t.entrada)}|${hhmm(t.saida)}|${Math.max(0, t.intervalo_minutos || 0)}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    out.push(t);
  }
  return out;
}
