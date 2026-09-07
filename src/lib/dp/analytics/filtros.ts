// ------------------------------------------------------------------
// Analytics — Pessoas 360° · filtros globais
//
// Setor é opcional no produto: a dimensão só existe quando alguma unidade do
// contexto tem setor ativo. E setor só pode ser combinado com a unidade a que
// pertence — a interface impede e a leitura descarta o que não bate.
// ------------------------------------------------------------------

import type { ColaboradorAnalytics } from "./equipe";

export const TODOS = "todos";

export interface AnalyticsFiltros {
  unidade: string;
  cargo: string;
  setor: string;
  vinculo: string;
}

export const FILTROS_PADRAO: AnalyticsFiltros = {
  unidade: TODOS,
  cargo: TODOS,
  setor: TODOS,
  vinculo: TODOS,
};

export interface SetorRef {
  id: string;
  nome: string;
  unidade_id: string | null;
  ativo: boolean | null;
}

/** Setores disponíveis para a unidade escolhida (todos, quando "todas"). */
export function setoresDisponiveis(
  setores: readonly SetorRef[],
  unidade: string,
): SetorRef[] {
  return setores.filter(
    (s) => s.ativo !== false && (unidade === TODOS || s.unidade_id === unidade || s.unidade_id === null),
  );
}

/** A dimensão Setor só liga quando existe pelo menos um setor ativo. */
export const dimensaoSetorAtiva = (setores: readonly SetorRef[]) =>
  setores.some((s) => s.ativo !== false);

/** Mantém coerência unidade × setor: setor de outra unidade é descartado. */
export function normalizarFiltros(
  filtros: AnalyticsFiltros,
  setores: readonly SetorRef[],
): AnalyticsFiltros {
  if (filtros.setor === TODOS) return filtros;
  const permitido = setoresDisponiveis(setores, filtros.unidade).some((s) => s.id === filtros.setor);
  return permitido ? filtros : { ...filtros, setor: TODOS };
}

/** O colaborador entra no corte atual do cadastro? */
export function colaboradorNoFiltro(
  c: ColaboradorAnalytics,
  f: AnalyticsFiltros,
): boolean {
  if (f.unidade !== TODOS && c.unidade_id !== f.unidade) return false;
  if (f.cargo !== TODOS && c.cargo_id !== f.cargo) return false;
  if (f.setor !== TODOS && c.setor_id !== f.setor) return false;
  if (f.vinculo !== TODOS && (c.regime ?? "") !== f.vinculo) return false;
  return true;
}
