import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { DP_CONFIG_DP_DEFAULT, type DpConfigDp } from "@/lib/dp/dsr-rules";

export type DpConfigDpForm = Omit<DpConfigDp, "company_id">;

const COLUNAS =
  "company_id, setor_comercio, periodicidade_domingo, periodicidade_domingo_mulher, folgas_fds_por_mes, politica_sabado, politica_feriado, regra_dsr, exige_validacao_menor, tipo_descanso_domingo, negociacao_id";

export function useDpConfigDp() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["dp_config_dp", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<DpConfigDpForm> => {
      const { data, error } = await supabase
        .from("dp_config_dp")
        .select(COLUNAS)
        .eq("company_id", selectedCompanyId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return DP_CONFIG_DP_DEFAULT;
      return {
        setor_comercio: data.setor_comercio,
        periodicidade_domingo: data.periodicidade_domingo,
        periodicidade_domingo_mulher: data.periodicidade_domingo_mulher,
        folgas_fds_por_mes: data.folgas_fds_por_mes,
        politica_sabado: data.politica_sabado,
        politica_feriado: data.politica_feriado,
        regra_dsr: data.regra_dsr,
        exige_validacao_menor: data.exige_validacao_menor,
        tipo_descanso_domingo:
          data.tipo_descanso_domingo === "acordo_coletivo" ? "acordo_coletivo" : "legal",
        negociacao_id: data.negociacao_id ?? null,
      };
    },
  });

  /** Negociações sindicais (ACT/CCT) disponíveis para embasar o acordo coletivo. */
  const negociacoes = useQuery({
    queryKey: ["dp_sindicato_negociacoes_opcoes", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_sindicato_negociacoes")
        .select("id, titulo, tipo_documento, vigencia_inicio, vigencia_fim")
        .eq("company_id", selectedCompanyId!)
        .order("vigencia_inicio", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });


  /** Existem colaboradoras mulheres cadastradas? Controla a exibição da regra do Art. 386. */
  const mulheres = useQuery({
    queryKey: ["dp_tem_mulheres", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<boolean> => {
      const { count, error } = await supabase
        .from("dp_colaboradores")
        .select("id", { count: "exact", head: true })
        .eq("company_id", selectedCompanyId!)
        .eq("sexo", "F");
      if (error) throw error;
      return (count ?? 0) > 0;
    },
  });

  const historico = useQuery({
    queryKey: ["dp_regras_historico", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_regras_historico")
        .select("id, usuario_id, tabela, valor_antigo, valor_novo, justificativa, ciencia_confirmada, created_at")
        .eq("company_id", selectedCompanyId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async (input: {
      patch: Partial<DpConfigDpForm>;
      cienciaConfirmada?: boolean;
      justificativa?: string | null;
    }) => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      const anterior = query.data ?? DP_CONFIG_DP_DEFAULT;
      const merged = { ...anterior, ...input.patch };

      const { error } = await supabase
        .from("dp_config_dp")
        .upsert({ company_id: selectedCompanyId, ...merged }, { onConflict: "company_id" });
      if (error) throw error;

      const { data: userData } = await supabase.auth.getUser();
      const { error: histError } = await supabase.from("dp_regras_historico").insert({
        company_id: selectedCompanyId,
        usuario_id: userData.user?.id ?? null,
        tabela: "dp_config_dp",
        valor_antigo: anterior as unknown as never,
        valor_novo: merged as unknown as never,
        justificativa: input.justificativa ?? null,
        ciencia_confirmada: !!input.cienciaConfirmada,
      });
      if (histError) throw histError;

      return merged;
    },
    onSuccess: (merged) => {
      qc.setQueryData(["dp_config_dp", selectedCompanyId], merged);
      qc.invalidateQueries({ queryKey: ["dp_regras_historico", selectedCompanyId] });
    },
  });

  const config = useMemo(() => query.data ?? DP_CONFIG_DP_DEFAULT, [query.data]);

  return {
    config,
    temMulheres: mulheres.data ?? false,
    historico: historico.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => {
      void query.refetch();
      void historico.refetch();
    },
    save: save.mutateAsync,
    saving: save.isPending,
  };
}
