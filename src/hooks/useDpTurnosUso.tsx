import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { TurnoUsoMap, TurnoUsoRow } from "@/lib/dp/turno-uso";

/**
 * Uso dos turnos da empresa em uma única chamada (dp_turnos_uso).
 * Alimenta o selo de uso, o filtro "Sem uso" e a validação de exclusão.
 */
export function useDpTurnosUso() {
  const { selectedCompanyId } = useCompanyContext();

  const query = useQuery({
    queryKey: ["dp_turnos_uso", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<TurnoUsoRow[]> => {
      const { data, error } = await supabase.rpc("dp_turnos_uso", {
        p_company_id: selectedCompanyId!,
      });
      if (error) throw error;
      return (data ?? []) as TurnoUsoRow[];
    },
  });

  const usoPorTurno = useMemo<TurnoUsoMap>(() => {
    const mapa: TurnoUsoMap = {};
    for (const row of query.data ?? []) mapa[row.turno_id] = row;
    return mapa;
  }, [query.data]);

  return { ...query, usoPorTurno, usoIndisponivel: query.isError };
}
