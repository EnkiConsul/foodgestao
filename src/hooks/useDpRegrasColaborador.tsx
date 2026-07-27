import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  DP_CONFIG_DP_DEFAULT,
  diasElegiveisDaConfig,
  tetoFolgasMes,
  type DpConfigDp,
} from "@/lib/dp/dsr-rules";

type Cfg = Omit<DpConfigDp, "company_id" | "unidade_id">;

/**
 * Regra de folgas efetiva do colaborador (exceção da unidade → padrão da empresa),
 * usada pelo portal para saber quais dias ele pode escolher e o teto do mês.
 */
export function useDpRegrasColaborador(companyId?: string | null, unidadeId?: string | null) {
  const query = useQuery({
    queryKey: ["dp_config_resolvida", companyId, unidadeId ?? null],
    enabled: !!companyId,
    queryFn: async (): Promise<Cfg> => {
      const { data, error } = await supabase.rpc("dp_config_resolvida", {
        _company_id: companyId!,
        _unidade_id: unidadeId ?? undefined,
      });
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
      if (!row) return DP_CONFIG_DP_DEFAULT;
      return {
        ...DP_CONFIG_DP_DEFAULT,
        setor_comercio: row.setor_comercio !== false,
        modo_frequencia_domingo: row.modo_frequencia_domingo === "por_mes" ? "por_mes" : "semanas",
        periodicidade_domingo: Number(row.periodicidade_domingo ?? 3),
        domingos_por_mes: Number(row.domingos_por_mes ?? 1),
        tipo_descanso_domingo:
          row.tipo_descanso_domingo === "acordo_coletivo" ? "acordo_coletivo" : "legal",
        dias_descanso_negociados: ((row.dias_descanso_negociados as number[] | null) ?? [0]).map(Number),
      };
    },
  });

  const config = query.data ?? DP_CONFIG_DP_DEFAULT;
  return {
    config,
    diasElegiveis: diasElegiveisDaConfig(config),
    tetoMensal: tetoFolgasMes(config),
    isLoading: query.isLoading,
  };
}
