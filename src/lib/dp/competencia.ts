/** Utilitários de competência 'yyyy-mm' sem drift de fuso. */

/** Primeiro dia (ISO) da competência. */
export function primeiroDiaDoMes(competencia: string): string {
  return `${competencia}-01`;
}

/**
 * Último dia real (ISO) da competência. Nunca devolve datas inexistentes
 * como '2026-09-31', que o banco rejeita.
 */
export function ultimoDiaDoMes(competencia: string): string {
  const [y, m] = competencia.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return competencia;
  const last = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}
