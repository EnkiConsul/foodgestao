import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { SalarioFamiliaConfig } from "@/lib/dp/salarioFamilia";

interface Row extends SalarioFamiliaConfig {
  id: string | null;
  adicionalAtivo: boolean;
}

const VAZIO: Row = {
  id: null,
  cota: null,
  teto: null,
  vigencia: null,
  confirmadoEm: null,
  adicionalAtivo: false,
};

/**
 * Tabela anual do salário-família e liga/desliga do adicional por tempo de
 * serviço. Guardados no registro de retaguarda da empresa em `dp_config_dp`.
 */
export function useDpSalarioFamiliaConfig() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["dp_salario_familia_config", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<Row> => {
      const { data, error } = await supabase
        .from("dp_config_dp")
        .select(
          "id, salario_familia_cota, salario_familia_teto, salario_familia_vigencia, salario_familia_confirmado_em, adicional_tempo_servico_ativo",
        )
        .eq("company_id", selectedCompanyId!)
        .is("unidade_id", null)
        .maybeSingle();
      if (error) throw error;
      if (!data) return VAZIO;
      return {
        id: data.id,
        cota: data.salario_familia_cota != null ? Number(data.salario_familia_cota) : null,
        teto: data.salario_familia_teto != null ? Number(data.salario_familia_teto) : null,
        vigencia: data.salario_familia_vigencia ?? null,
        confirmadoEm: data.salario_familia_confirmado_em ?? null,
        adicionalAtivo: !!data.adicional_tempo_servico_ativo,
      };
    },
  });

  const salvar = useMutation({
    mutationFn: async (input: {
      cota?: number | null;
      teto?: number | null;
      vigencia?: string | null;
      adicionalAtivo?: boolean;
      confirmar?: boolean;
    }) => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      const patch: Record<string, unknown> = {};
      if (input.cota !== undefined) patch.salario_familia_cota = input.cota;
      if (input.teto !== undefined) patch.salario_familia_teto = input.teto;
      if (input.vigencia !== undefined) patch.salario_familia_vigencia = input.vigencia;
      if (input.adicionalAtivo !== undefined)
        patch.adicional_tempo_servico_ativo = input.adicionalAtivo;
      if (input.confirmar)
        patch.salario_familia_confirmado_em = new Date().toISOString().slice(0, 10);

      const atual = query.data;
      if (atual?.id) {
        const { error } = await supabase.from("dp_config_dp").update(patch).eq("id", atual.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from("dp_config_dp")
        .insert({ company_id: selectedCompanyId, unidade_id: null, ...patch });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["dp_salario_familia_config", selectedCompanyId] });
      void qc.invalidateQueries({ queryKey: ["dp_config_dp", selectedCompanyId] });
    },
  });

  return {
    config: query.data ?? VAZIO,
    isLoading: query.isLoading,
    salvar: salvar.mutateAsync,
    salvando: salvar.isPending,
  };
}
