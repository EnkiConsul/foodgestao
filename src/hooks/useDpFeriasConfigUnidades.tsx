import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { FeriasAdiantamento13 } from "@/hooks/useDpFeriasConfig";

export type OverrideUnidade = {
  id: string;
  unidadeId: string;
  adiantamento13: FeriasAdiantamento13 | null;
};

/**
 * Exceções por unidade da política de adiantamento do 13º.
 * Sem linha (ou com valor vazio) a unidade segue a regra da empresa.
 */
export function useDpFeriasConfigUnidades() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const chave = ["dp_ferias_config_unidades", selectedCompanyId];

  const query = useQuery({
    queryKey: chave,
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<OverrideUnidade[]> => {
      const { data, error } = await supabase
        .from("dp_config_dp")
        .select("id, unidade_id, ferias_adiantamento_13")
        .eq("company_id", selectedCompanyId!)
        .not("unidade_id", "is", null);
      if (error) throw error;
      return (data ?? [])
        .filter((r) => !!r.unidade_id)
        .map((r) => ({
          id: r.id as string,
          unidadeId: r.unidade_id as string,
          adiantamento13: (r.ferias_adiantamento_13 ?? null) as FeriasAdiantamento13 | null,
        }));
    },
  });

  const save = useMutation({
    mutationFn: async (input: {
      unidadeId: string;
      adiantamento13: FeriasAdiantamento13 | null;
    }) => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      const existente = (query.data ?? []).find((o) => o.unidadeId === input.unidadeId);
      if (existente) {
        const { error } = await supabase
          .from("dp_config_dp")
          .update({ ferias_adiantamento_13: input.adiantamento13 })
          .eq("id", existente.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("dp_config_dp").insert({
        company_id: selectedCompanyId,
        unidade_id: input.unidadeId,
        ferias_adiantamento_13: input.adiantamento13,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Exceção da unidade atualizada");
      void qc.invalidateQueries({ queryKey: chave });
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível salvar a exceção"),
  });

  return { overrides: query.data ?? [], isLoading: query.isLoading, save };
}
