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

/** Contagem de assinaturas por plano (para bloquear exclusão de planos vinculados). */
export function usePlanSubscriptionCounts() {
  return useQuery({
    queryKey: ["admin-plan-subscription-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subscriptions").select("plan_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of data ?? []) {
        if (row.plan_id) counts[row.plan_id] = (counts[row.plan_id] ?? 0) + 1;
      }
      return counts;
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
      qc.invalidateQueries({ queryKey: ["admin-plan-subscription-counts"] });
      toast.success("Plano excluído");
    },
    onError: (e: any) => {
      const linked =
        e?.code === "23503" || String(e?.message ?? "").includes("subscriptions_plan_id_fkey");
      toast.error(
        linked
          ? "Este plano possui assinaturas vinculadas. Desative-o em vez de excluir."
          : (e?.message ?? "Não foi possível excluir"),
      );
    },
  });
}
