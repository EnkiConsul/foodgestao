import { differenceInCalendarDays, differenceInYears } from "date-fns";

/** Próxima ocorrência para o resumo, ou ocorrência do mês consultado. */
export function aniversarioNoPeriodo(raw: string, competencia?: string, hoje = new Date()) {
  const origem = new Date(`${raw.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(origem.getTime())) return null;
  const ano = competencia ? Number(competencia.slice(0, 4)) : hoje.getFullYear();
  const data = new Date(ano, origem.getMonth(), origem.getDate());
  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  if (!competencia && data < inicioHoje) data.setFullYear(ano + 1);
  const faltamDias = differenceInCalendarDays(data, hoje);
  if (competencia) {
    if (data.getMonth() !== Number(competencia.slice(5, 7)) - 1) return null;
  } else if (faltamDias < 0 || faltamDias > 30) return null;
  if (data < origem) return null;
  return { data, faltamDias, anosCompletos: differenceInYears(data, origem), diaMes: `${String(data.getDate()).padStart(2, "0")}/${String(data.getMonth() + 1).padStart(2, "0")}` };
}