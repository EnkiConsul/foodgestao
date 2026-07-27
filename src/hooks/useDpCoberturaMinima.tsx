import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { RegraCobertura } from "@/lib/dp/cobertura-utils";

/** Regras de cobertura mínima da empresa (usadas na escala e na operação do dia). */
export function useDpCoberturaMinima() {
  const { selectedCompanyId } = useCompanyContext();

  const query = useQuery({
    queryKey: ["dp_cobertura_minima_regras", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<RegraCobertura[]> => {
      const { data, error } = await supabase
        .from("dp_cobertura_minima")
        .select("id, unidade_id, cargo_id, dia_semana, turno_id, minimo, ativo, vigencia_inicio, vigencia_fim")
        .eq("company_id", selectedCompanyId!);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        unidade_id: r.unidade_id,
        cargo_id: r.cargo_id,
        dia_semana: r.dia_semana,
        turno_id: r.turno_id,
        minimo: r.minimo,
        ativo: r.ativo ?? true,
        vigencia_inicio: r.vigencia_inicio,
        vigencia_fim: r.vigencia_fim,
      }));
    },
  });

  return { regras: query.data ?? [], isLoading: query.isLoading, error: query.error };
}
