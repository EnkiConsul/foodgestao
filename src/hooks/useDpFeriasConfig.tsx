import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { FeriasSinalizacaoCiclo } from "@/lib/dp/ferias-direito";

export type FeriasAdiantamento13 = "nao" | "legal" | "qualquer_epoca";

export type FeriasConfig = {
  avisoAntecedenciaDias: number;
  adiantamento13: FeriasAdiantamento13;
  /** Quantos períodos, no máximo, as férias podem ser divididas. */
  fracionamentoMax: number;
  /** Tamanho mínimo de cada período. */
  fracaoMinDias: number;
  /** Tamanho mínimo que ao menos um dos períodos precisa ter. */
  fracaoMaiorDias: number;
  /** A partir de quando o sistema controla as férias (antes disso é histórico). */
  controleInicio: string | null;
  /** Como sinalizar ciclos aquisitivos já encerrados com saldo a conceder. */
  sinalizacaoCicloEncerrado: FeriasSinalizacaoCiclo;
};

export const FERIAS_CONFIG_DEFAULT: FeriasConfig = {
  avisoAntecedenciaDias: 60,
  adiantamento13: "legal",
  fracionamentoMax: 3,
  fracaoMinDias: 5,
  fracaoMaiorDias: 14,
  controleInicio: null,
  sinalizacaoCicloEncerrado: "a_conceder",
};

export const ADIANTAMENTO_13_LABEL: Record<FeriasAdiantamento13, string> = {
  nao: "Não oferecemos adiantamento junto às férias",
  legal: "Somente quando o colaborador pedir até janeiro (regra legal)",
  qualquer_epoca: "Podemos adiantar em qualquer época do ano",
};

/** Regra de férias da empresa: antecedência do aviso e política do 13º. */
export function useDpFeriasConfig() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["dp_ferias_config", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_config_dp")
        .select(
          "id, ferias_aviso_antecedencia_dias, ferias_adiantamento_13, ferias_fracionamento_max, ferias_fracao_min_dias, ferias_fracao_maior_dias, ferias_controle_inicio, ferias_sinalizacao_ciclo_encerrado",
        )
        .eq("company_id", selectedCompanyId!)
        .is("unidade_id", null)
        .maybeSingle();
      if (error) throw error;
      return {
        id: (data?.id as string | undefined) ?? null,
        config: {
          avisoAntecedenciaDias: Number(
            data?.ferias_aviso_antecedencia_dias ?? FERIAS_CONFIG_DEFAULT.avisoAntecedenciaDias,
          ),
          adiantamento13: (data?.ferias_adiantamento_13 ??
            FERIAS_CONFIG_DEFAULT.adiantamento13) as FeriasAdiantamento13,
          fracionamentoMax: Number(
            data?.ferias_fracionamento_max ?? FERIAS_CONFIG_DEFAULT.fracionamentoMax,
          ),
          fracaoMinDias: Number(
            data?.ferias_fracao_min_dias ?? FERIAS_CONFIG_DEFAULT.fracaoMinDias,
          ),
          fracaoMaiorDias: Number(
            data?.ferias_fracao_maior_dias ?? FERIAS_CONFIG_DEFAULT.fracaoMaiorDias,
          ),
          controleInicio: (data?.ferias_controle_inicio as string | null | undefined) ?? null,
          sinalizacaoCicloEncerrado: (data?.ferias_sinalizacao_ciclo_encerrado ??
            FERIAS_CONFIG_DEFAULT.sinalizacaoCicloEncerrado) as FeriasSinalizacaoCiclo,
        } satisfies FeriasConfig,
      };
    },
  });

  const save = useMutation({
    mutationFn: async (patch: Partial<FeriasConfig>) => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      const atual = query.data?.config ?? FERIAS_CONFIG_DEFAULT;
      const payload = {
        ferias_aviso_antecedencia_dias:
          patch.avisoAntecedenciaDias ?? atual.avisoAntecedenciaDias,
        ferias_adiantamento_13: patch.adiantamento13 ?? atual.adiantamento13,
        ferias_fracionamento_max: patch.fracionamentoMax ?? atual.fracionamentoMax,
        ferias_fracao_min_dias: patch.fracaoMinDias ?? atual.fracaoMinDias,
        ferias_fracao_maior_dias: patch.fracaoMaiorDias ?? atual.fracaoMaiorDias,
        ferias_controle_inicio:
          patch.controleInicio !== undefined ? patch.controleInicio : atual.controleInicio,
        ferias_sinalizacao_ciclo_encerrado:
          patch.sinalizacaoCicloEncerrado ?? atual.sinalizacaoCicloEncerrado,
      };
      if (query.data?.id) {
        const { error } = await supabase
          .from("dp_config_dp")
          .update(payload)
          .eq("id", query.data.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from("dp_config_dp")
        .insert({ ...payload, company_id: selectedCompanyId, unidade_id: null });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Regra de férias atualizada");
      void qc.invalidateQueries({ queryKey: ["dp_ferias_config", selectedCompanyId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível salvar a regra"),
  });

  return {
    config: query.data?.config ?? FERIAS_CONFIG_DEFAULT,
    isLoading: query.isLoading,
    save,
  };
}
