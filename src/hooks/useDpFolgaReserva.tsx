import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "./useCompanyContext";

/**
 * Contagem de indisponibilidades ativas de convocáveis por dia.
 * Usada pelo calendário de folgas para reservar vagas quando a empresa
 * ativa a chave em Convocações → Regras.
 *
 * No painel administrativo a RLS permite ler todas as indisponibilidades
 * da empresa; no portal o colaborador vê apenas as próprias, portanto esta
 * contagem não é usada para o cálculo visual do portal (a validação final
 * ocorre no backend via dp_folga_limite_dia).
 */
export function useDpFolgaReserva(cursor: Date) {
  const { selectedCompanyId } = useCompanyContext();
  const inicio = format(startOfMonth(cursor), "yyyy-MM-dd");
  const fim = format(endOfMonth(cursor), "yyyy-MM-dd");

  const query = useQuery({
    queryKey: ["dp_folga_reserva", selectedCompanyId, inicio, fim],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_indisponibilidades")
        .select("data")
        .eq("company_id", selectedCompanyId!)
        .is("cancelada_em", null)
        .gte("data", inicio)
        .lte("data", fim);
      if (error) throw error;
      return data ?? [];
    },
  });

  const reservasByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of query.data ?? []) {
      map.set(row.data, (map.get(row.data) ?? 0) + 1);
    }
    return map;
  }, [query.data]);

  return { ...query, reservasByDay };
}
