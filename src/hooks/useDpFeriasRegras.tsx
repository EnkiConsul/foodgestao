import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { Database } from "@/integrations/supabase/types";

export type FeriasRegra = Database["public"]["Tables"]["dp_ferias_regras"]["Row"];
export type FeriasBloqueio = Database["public"]["Tables"]["dp_ferias_bloqueios"]["Row"];

export type FeriasRegraInput = {
  id?: string;
  unidade_id: string | null;
  cargo_id: string | null;
  turno: Database["public"]["Enums"]["dp_turno"] | null;
  max_simultaneos: number;
  ativo: boolean;
  observacao: string | null;
};

export type FeriasBloqueioInput = {
  id?: string;
  unidade_id: string | null;
  nome: string;
  data_inicio: string;
  data_fim: string;
  recorrente_anual: boolean;
  permite_excecao: boolean;
  ativo: boolean;
  observacao: string | null;
};

/** Regras de simultaneidade e períodos bloqueados de férias. */
export function useDpFeriasRegras() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["dp_ferias_regras"] });
    qc.invalidateQueries({ queryKey: ["dp_ferias_bloqueios"] });
  };

  const regrasQ = useQuery({
    queryKey: ["dp_ferias_regras", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_ferias_regras")
        .select("*")
        .eq("company_id", selectedCompanyId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as FeriasRegra[];
    },
  });

  const bloqueiosQ = useQuery({
    queryKey: ["dp_ferias_bloqueios", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_ferias_bloqueios")
        .select("*")
        .eq("company_id", selectedCompanyId!)
        .order("data_inicio", { ascending: true });
      if (error) throw error;
      return (data ?? []) as FeriasBloqueio[];
    },
  });

  const saveRegra = useMutation({
    mutationFn: async (input: FeriasRegraInput) => {
      if (!selectedCompanyId) throw new Error("Selecione uma empresa.");
      const payload = { ...input, company_id: selectedCompanyId };
      const { error } = input.id
        ? await supabase.from("dp_ferias_regras").update(payload).eq("id", input.id)
        : await supabase.from("dp_ferias_regras").insert(payload);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deleteRegra = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_ferias_regras").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const saveBloqueio = useMutation({
    mutationFn: async (input: FeriasBloqueioInput) => {
      if (!selectedCompanyId) throw new Error("Selecione uma empresa.");
      if (input.data_fim < input.data_inicio) throw new Error("A data final deve ser posterior à inicial.");
      const payload = { ...input, company_id: selectedCompanyId };
      const { error } = input.id
        ? await supabase.from("dp_ferias_bloqueios").update(payload).eq("id", input.id)
        : await supabase.from("dp_ferias_bloqueios").insert(payload);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deleteBloqueio = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_ferias_bloqueios").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return {
    regras: regrasQ.data ?? [],
    bloqueios: bloqueiosQ.data ?? [],
    isLoading: regrasQ.isLoading || bloqueiosQ.isLoading,
    isError: regrasQ.isError || bloqueiosQ.isError,
    refetch: () => { void regrasQ.refetch(); void bloqueiosQ.refetch(); },
    saveRegra,
    deleteRegra,
    saveBloqueio,
    deleteBloqueio,
  };
}
