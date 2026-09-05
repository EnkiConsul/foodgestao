import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { RegraLimiteFolga } from "@/lib/dp/folga-limites";

export type RegraLimiteInput = {
  id?: string;
  unidade_id: string | null;
  dia_semana: number | null;
  maximo: number;
  vigencia_inicio: string | null;
  vigencia_fim: string | null;
  ativo: boolean;
  cargo_ids: string[];
};

/** Regras recorrentes de "quantas pessoas podem folgar por dia". */
export function useDpFolgaLimites() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["dp_folga_limite_regras", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<RegraLimiteFolga[]> => {
      const { data, error } = await supabase
        .from("dp_folga_limite_regras")
        .select(
          "id, unidade_id, dia_semana, maximo, vigencia_inicio, vigencia_fim, ativo, dp_folga_limite_regra_cargos(cargo_id)",
        )
        .eq("company_id", selectedCompanyId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        unidade_id: r.unidade_id,
        dia_semana: r.dia_semana,
        maximo: r.maximo,
        vigencia_inicio: r.vigencia_inicio,
        vigencia_fim: r.vigencia_fim,
        ativo: r.ativo ?? true,
        cargo_ids: (r.dp_folga_limite_regra_cargos ?? []).map((c: any) => c.cargo_id),
      }));
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["dp_folga_limite_regras"] });
  };

  const salvar = useMutation({
    mutationFn: async (input: RegraLimiteInput) => {
      if (!selectedCompanyId) throw new Error("Selecione uma empresa.");
      const payload = {
        company_id: selectedCompanyId,
        unidade_id: input.unidade_id,
        dia_semana: input.dia_semana,
        maximo: input.maximo,
        vigencia_inicio: input.vigencia_inicio,
        vigencia_fim: input.vigencia_fim,
        ativo: input.ativo,
      };

      let regraId = input.id;
      if (regraId) {
        const { error } = await supabase
          .from("dp_folga_limite_regras")
          .update(payload)
          .eq("id", regraId);
        if (error) throw error;
        const { error: delErr } = await supabase
          .from("dp_folga_limite_regra_cargos")
          .delete()
          .eq("regra_id", regraId);
        if (delErr) throw delErr;
      } else {
        const { data, error } = await supabase
          .from("dp_folga_limite_regras")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        regraId = data.id;
      }

      if (input.cargo_ids.length > 0) {
        const { error } = await supabase
          .from("dp_folga_limite_regra_cargos")
          .insert(input.cargo_ids.map((cargo_id) => ({ regra_id: regraId!, cargo_id })));
        if (error) throw error;
      }
      return regraId!;
    },
    onSuccess: invalidate,
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_folga_limite_regras").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const alternarAtivo = useMutation({
    mutationFn: async (params: { id: string; ativo: boolean }) => {
      const { error } = await supabase
        .from("dp_folga_limite_regras")
        .update({ ativo: params.ativo })
        .eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return {
    regras: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    salvar,
    excluir,
    alternarAtivo,
  };
}
