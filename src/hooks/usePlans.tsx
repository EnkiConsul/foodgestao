import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { notifyError } from "@/lib/notifyError";

export type PlanModule = "financeiro" | "pessoas";

export const MODULE_LABELS: Record<PlanModule, string> = {
  financeiro: "Financeiro 360°",
  pessoas: "Pessoas 360°",
};

/** Catálogo de planos (todos, para o Backoffice). */
export function usePlans() {
  return useQuery({
    queryKey: ["admin-plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plans")
        .select("*")
        .order("module", { ascending: true })
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data as any[];
    },
  });
}

export function usePlanAddons() {
  return useQuery({
    queryKey: ["admin-plan-addons"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("plan_addons")
        .select("*")
        .order("module")
        .order("sort_order");
      if (error) throw error;
      return data as any[];
    },
  });
}

function friendly(e: any, fallback: string) {
  if (e?.code === "23503") {
    return notifyError(new Error("Este plano possui assinaturas vinculadas. Desative-o em vez de excluir."), {
      surface: "Backoffice", action: "excluir", fallback,
    });
  }
  if (e?.code === "23505") {
    return notifyError(new Error("Já existe um cadastro com esse identificador."), { surface: "Backoffice", action: "salvar", fallback });
  }
  return notifyError(e, { surface: "Backoffice", action: "salvar", fallback });
}

export function useUpsertPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (plan: any) => {
      const { id, created_at, updated_at, ...rest } = plan;
      const q = id
        ? supabase.from("plans").update(rest).eq("id", id)
        : supabase.from("plans").insert(rest);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-plans"] });
      toast.success("Plano salvo");
    },
    onError: (e) => friendly(e, "Erro ao salvar plano"),
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
    onError: (e) => friendly(e, "Erro ao excluir plano"),
  });
}

export function useUpsertAddon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (addon: any) => {
      const { id, created_at, updated_at, ...rest } = addon;
      const t = (supabase as any).from("plan_addons");
      const { error } = id ? await t.update(rest).eq("id", id) : await t.insert(rest);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-plan-addons"] });
      toast.success("Adicional salvo");
    },
    onError: (e) => friendly(e, "Erro ao salvar adicional"),
  });
}

export function useDeleteAddon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("plan_addons").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-plan-addons"] });
      toast.success("Adicional excluído");
    },
    onError: (e: any) =>
      e?.code === "23503"
        ? notifyError(new Error("Adicional em uso por clientes. Desative-o em vez de excluir."), { surface: "Backoffice", action: "excluir", fallback: "Erro" })
        : friendly(e, "Erro ao excluir adicional"),
  });
}

export function useSubscriptionPlanCounts() {
  return useQuery({
    queryKey: ["admin-plan-sub-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subscriptions").select("plan_id");
      if (error) throw error;
      const map: Record<string, number> = {};
      (data ?? []).forEach((r: any) => (map[r.plan_id] = (map[r.plan_id] ?? 0) + 1));
      return map;
    },
  });
}
