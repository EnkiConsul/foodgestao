import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";

export type DpPendenciasConfig = {
  alerta_solicitacao_dias: number;
  alerta_troca_dias: number;
  alerta_contracheque_dia_mes: number;
  alerta_adiantamento_offset: number;
  alerta_folha_ponto_dia_mes: number;
  alerta_negociacao_dias: number;
  dias_carencia_portal: number;
};

export const DP_PENDENCIAS_CONFIG_DEFAULT: DpPendenciasConfig = {
  alerta_solicitacao_dias: 3,
  alerta_troca_dias: 3,
  alerta_contracheque_dia_mes: 10,
  alerta_adiantamento_offset: 5,
  alerta_folha_ponto_dia_mes: 10,
  alerta_negociacao_dias: 30,
  dias_carencia_portal: 30,
};


export function useDpPendenciasConfig() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["dp_pendencias_config", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<DpPendenciasConfig> => {
      const { data, error } = await supabase
        .from("dp_pendencias_config")
        .select(
          "alerta_solicitacao_dias, alerta_troca_dias, alerta_contracheque_dia_mes, alerta_adiantamento_offset, alerta_folha_ponto_dia_mes, alerta_negociacao_dias",
        )
        .eq("company_id", selectedCompanyId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return DP_PENDENCIAS_CONFIG_DEFAULT;
      return {
        alerta_solicitacao_dias: data.alerta_solicitacao_dias ?? DP_PENDENCIAS_CONFIG_DEFAULT.alerta_solicitacao_dias,
        alerta_troca_dias: data.alerta_troca_dias ?? DP_PENDENCIAS_CONFIG_DEFAULT.alerta_troca_dias,
        alerta_contracheque_dia_mes:
          data.alerta_contracheque_dia_mes ?? DP_PENDENCIAS_CONFIG_DEFAULT.alerta_contracheque_dia_mes,
        alerta_adiantamento_offset:
          data.alerta_adiantamento_offset ?? DP_PENDENCIAS_CONFIG_DEFAULT.alerta_adiantamento_offset,
        alerta_folha_ponto_dia_mes:
          data.alerta_folha_ponto_dia_mes ?? DP_PENDENCIAS_CONFIG_DEFAULT.alerta_folha_ponto_dia_mes,
        alerta_negociacao_dias: data.alerta_negociacao_dias ?? DP_PENDENCIAS_CONFIG_DEFAULT.alerta_negociacao_dias,
      };
    },
  });

  const save = useMutation({
    mutationFn: async (patch: Partial<DpPendenciasConfig>) => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      const merged = { ...(query.data ?? DP_PENDENCIAS_CONFIG_DEFAULT), ...patch };
      const { error } = await supabase
        .from("dp_pendencias_config")
        .upsert({ company_id: selectedCompanyId, ...merged }, { onConflict: "company_id" });
      if (error) throw error;
      return merged;
    },
    onSuccess: (merged) => {
      qc.setQueryData(["dp_pendencias_config", selectedCompanyId], merged);
      qc.invalidateQueries({ queryKey: ["dp_pendencias"] });
    },
  });

  return {
    config: query.data ?? DP_PENDENCIAS_CONFIG_DEFAULT,
    isLoading: query.isLoading,
    save: save.mutate,
    saving: save.isPending,
  };
}
