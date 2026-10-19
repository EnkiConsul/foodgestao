import { addDays, addMonths, format } from "date-fns";

export type CalendarioResumoAba = "hoje" | "mes";
export interface CalendarioResumoNavigation {
  aba: CalendarioResumoAba;
  competencia: string;
  selecionado: string;
}
export type CalendarioResumoAction =
  | { type: "aba"; aba: CalendarioResumoAba }
  | { type: "avancar"; delta: number }
  | { type: "selecionar"; data: string }
  | { type: "hoje"; data: string };

/** Apenas navegação visual; contagens continuam no panorama oficial. */
export function calendarioResumoNavigation(state: CalendarioResumoNavigation, action: CalendarioResumoAction): CalendarioResumoNavigation {
  if (action.type === "aba") return { ...state, aba: action.aba, competencia: action.aba === "hoje" ? state.selecionado.slice(0, 7) : state.competencia };
  if (action.type === "selecionar" || action.type === "hoje") return { ...state, selecionado: action.data, competencia: action.data.slice(0, 7) };
  if (state.aba === "mes") return { ...state, competencia: format(addMonths(new Date(`${state.competencia}-01T12:00:00`), action.delta), "yyyy-MM") };
  const selecionado = format(addDays(new Date(`${state.selecionado}T12:00:00`), action.delta), "yyyy-MM-dd");
  return { ...state, selecionado, competencia: selecionado.slice(0, 7) };
}
