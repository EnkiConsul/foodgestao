import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function usePlans() {
  return useQuery({
    queryKey: ["admin-plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plans")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useUpsertPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (plan: any) => {
      if (plan.id) {
        const { id, created_at, updated_at, ...rest } = plan;
        const { error } = await supabase.from("plans").update(rest).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("plans").insert(plan);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-plans"] });
      toast.success("Plano salvo");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao salvar plano"),
  });
}

export function useDeletePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("plans").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-plans"] });
      toast.success("Plano excluído");
    },
    onError: (e: any) => toast.error(e.message ?? "Não foi possível excluir"),
  });
}
