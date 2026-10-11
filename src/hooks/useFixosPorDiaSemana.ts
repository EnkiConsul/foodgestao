import { useMemo } from "react";
import { useDpColaboradores } from "@/hooks/useDpColaboradores";
import { normalizeWeekday } from "@/lib/dp/folga-rules";

/** Quantos ativos da unidade têm folga fixa em cada dia da semana (mesma fonte do Calendário de Folgas). */
export function useFixosPorDiaSemana(_companyId: string | null | undefined, unidadeId: string | null) {
  const colabs = useDpColaboradores();
  const data = useMemo(() => {
    if (!unidadeId || !colabs.data) return undefined;
    const m = new Map<number, number>();
    for (const c of colabs.data as { ativo?: boolean | null; unidade_id: string | null; folga_fixa_semana?: unknown }[]) {
      if (c.ativo === false || c.unidade_id !== unidadeId) continue;
      const wd = normalizeWeekday(c.folga_fixa_semana);
      if (wd != null) m.set(wd, (m.get(wd) ?? 0) + 1);
    }
    return m;
  }, [colabs.data, unidadeId]);
  return { data };
}
