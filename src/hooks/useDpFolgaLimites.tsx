import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { RegraLimiteFolga, TipoRegraFolga } from "@/lib/dp/folga-limites";

export type RegraLimiteInput = {
  id?: string;
  tipo: TipoRegraFolga;
  nome: string | null;
  unidade_id: string | null;
  dia_semana: number | null;
  maximo: number;
  vigencia_inicio: string | null;
  vigencia_fim: string | null;
  ativo: boolean;
  cargo_ids: string[];
  colaborador_ids: string[];
};

/** Cadastro único das regras de folga (quantidade, cargo e quem não folga junto). */
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
          "id, tipo, nome, unidade_id, dia_semana, maximo, vigencia_inicio, vigencia_fim, ativo, " +
            "dp_folga_limite_regra_cargos(cargo_id), dp_folga_limite_regra_colaboradores(colaborador_id)",
        )
        .eq("company_id", selectedCompanyId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        tipo: (r.tipo ?? "quantidade") as TipoRegraFolga,
        nome: r.nome ?? null,
        unidade_id: r.unidade_id,
        dia_semana: r.dia_semana,
        maximo: r.maximo,
        vigencia_inicio: r.vigencia_inicio,
        vigencia_fim: r.vigencia_fim,
        ativo: r.ativo ?? true,
        cargo_ids: (r.dp_folga_limite_regra_cargos ?? []).map((c: any) => c.cargo_id),
        colaborador_ids: (r.dp_folga_limite_regra_colaboradores ?? []).map(
          (c: any) => c.colaborador_id,
        ),
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
        tipo: input.tipo,
        nome: input.nome,
        unidade_id: input.unidade_id,
        dia_semana: input.dia_semana,
        maximo: input.tipo === "colaboradores" ? 0 : input.maximo,
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
        const { error: delColabErr } = await supabase
          .from("dp_folga_limite_regra_colaboradores")
          .delete()
          .eq("regra_id", regraId);
        if (delColabErr) throw delColabErr;
      } else {
        const { data, error } = await supabase
          .from("dp_folga_limite_regras")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        regraId = data.id;
      }

      const cargos = input.tipo === "cargo" ? input.cargo_ids : [];
      if (cargos.length > 0) {
        const { error } = await supabase
          .from("dp_folga_limite_regra_cargos")
          .insert(cargos.map((cargo_id) => ({ regra_id: regraId!, cargo_id })));
        if (error) throw error;
      }

      const pessoas = input.tipo === "colaboradores" ? input.colaborador_ids : [];
      if (pessoas.length > 0) {
        const { error } = await supabase
          .from("dp_folga_limite_regra_colaboradores")
          .insert(pessoas.map((colaborador_id) => ({ regra_id: regraId!, colaborador_id })));
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
