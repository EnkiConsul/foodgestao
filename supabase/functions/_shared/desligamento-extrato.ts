import type { ResultadoDesligamento } from "./desligamento-motor.ts";

/** Evidência da escala utilizada, sem saldos ou valores financeiros. */
export function extratoAviso(r: ResultadoDesligamento) {
  return {
    inicio_aviso: r.inicioAviso,
    periodo_reducao: r.periodoReducao,
    folgas_compensatorias: r.folgasAceitas,
    dias_sem_expediente: r.calendario.filter((d) => d.jornadaHabitual === 0).map((d) => d.data),
    dias_art488: r.calendario.filter((d) => d.classificacao === "ausencia_legal_aviso" && d.jornadaHabitual > 0).map((d) => d.data),
    ultimo_sem_banco: r.calendario.filter((d) => d.jornadaHabitual > 0 && d.classificacao !== "ausencia_legal_aviso").at(-1)?.data ?? null,
  };
}