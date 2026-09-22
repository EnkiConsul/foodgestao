import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { salvarConfigDp } from "@/lib/dp/regras-oficial";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { FeriasAdiantamento13 } from "@/hooks/useDpFeriasConfig";
import { notifyError } from "@/lib/notifyError";

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
      await salvarConfigDp({
        companyId: selectedCompanyId,
        unidadeId: input.unidadeId,
        patch: { ferias_adiantamento_13: input.adiantamento13 },
      });
    },
    onSuccess: () => {
      toast.success("Exceção da unidade atualizada");
      void qc.invalidateQueries({ queryKey: chave });
    },
    onError: (e: any) => notifyError(e, { surface: "Férias", action: "concluir a ação", fallback: "Não foi possível salvar a exceção" }),
  });

  return { overrides: query.data ?? [], isLoading: query.isLoading, save };
}
