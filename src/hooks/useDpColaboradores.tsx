import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { Database } from "@/integrations/supabase/types";

export type DpColaborador = Database["public"]["Tables"]["dp_colaboradores"]["Row"];
export type DpColaboradorInsert = Database["public"]["Tables"]["dp_colaboradores"]["Insert"];

export function useDpColaboradores() {
  const { selectedCompanyId } = useCompanyContext();
  return useQuery({
    queryKey: ["dp_colaboradores", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_colaboradores")
        .select("*")
        .eq("company_id", selectedCompanyId!)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as DpColaborador[];
    },
  });
}

export function useUpsertDpColaborador() {
  const qc = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  return useMutation({
    mutationFn: async (input: Partial<DpColaboradorInsert> & { id?: string; nome: string }) => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      const payload = { ...input, company_id: selectedCompanyId } as DpColaboradorInsert;
      if (input.id) {
        const { error } = await supabase.from("dp_colaboradores").update(payload).eq("id", input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("dp_colaboradores").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dp_colaboradores"] }),
  });
}

export function useDeleteDpColaborador() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_colaboradores").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dp_colaboradores"] }),
  });
}
