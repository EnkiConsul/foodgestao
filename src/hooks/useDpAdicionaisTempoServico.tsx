import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { RegraTempoServico } from "@/lib/dp/tempoServico";

const COLUNAS =
  "id, nome, escopo, sindicato_id, unidade_id, cargo_id, ciclo_meses, percentual_por_ciclo, base, " +
  "max_ciclos, acumula, vigencia_inicio, vigencia_fim, ativo, observacao";

export type RegraTempoServicoInput = Omit<RegraTempoServico, "id"> & { id?: string };

/** Regras de adicional por tempo de serviço da empresa. */
export function useDpAdicionaisTempoServico() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["dp_adicionais_tempo_servico", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<RegraTempoServico[]> => {
      const { data, error } = await supabase
        .from("dp_adicionais_tempo_servico")
        .select(COLUNAS)
        .eq("company_id", selectedCompanyId!)
        .order("vigencia_inicio", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as unknown as RegraTempoServico[];
      return rows.map((r) => ({
        ...r,
        percentual_por_ciclo: Number(r.percentual_por_ciclo),
        ciclo_meses: Number(r.ciclo_meses),
      }));
    },
  });

  const invalidate = () =>
    void qc.invalidateQueries({ queryKey: ["dp_adicionais_tempo_servico", selectedCompanyId] });

  const salvar = useMutation({
    mutationFn: async (input: RegraTempoServicoInput) => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      const payload = {
        company_id: selectedCompanyId,
        nome: input.nome.trim() || "Adicional por tempo de serviço",
        escopo: input.escopo,
        sindicato_id: input.escopo === "sindicato" ? input.sindicato_id : null,
        unidade_id: input.escopo === "unidade" ? input.unidade_id : null,
        cargo_id: input.escopo === "cargo" ? input.cargo_id : null,
        ciclo_meses: input.ciclo_meses,
        percentual_por_ciclo: input.percentual_por_ciclo,
        base: input.base,
        max_ciclos: input.max_ciclos,
        acumula: input.acumula,
        vigencia_inicio: input.vigencia_inicio,
        vigencia_fim: input.vigencia_fim || null,
        ativo: input.ativo,
        observacao: input.observacao?.trim() || null,
      };
      if (input.id) {
        const { error } = await supabase
          .from("dp_adicionais_tempo_servico")
          .update(payload)
          .eq("id", input.id);
        if (error) throw error;
        return input.id;
      }
      const { data, error } = await supabase
        .from("dp_adicionais_tempo_servico")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: invalidate,
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_adicionais_tempo_servico").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return {
    regras: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
    salvar: salvar.mutateAsync,
    salvando: salvar.isPending,
    remover: remover.mutateAsync,
    removendo: remover.isPending,
  };
}
