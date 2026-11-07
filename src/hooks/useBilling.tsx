import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { notifyError } from "@/lib/notifyError";

export type EscopoAssinaturas = "contratantes" | "sem_contratacao" | "teste";

export function useAdminSubscriptions(escopo: EscopoAssinaturas = "contratantes", enabled = true) {
  return useQuery({
    queryKey: ["admin-subscriptions", escopo],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_assinaturas_lista" as any, { p_escopo: escopo });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

export type EscopoFaturas = "reais" | "teste" | "todas";

export function useAdminInvoices(filters?: { status?: string; userId?: string; escopo?: EscopoFaturas }) {
  const escopo = filters?.escopo ?? "reais";
  return useQuery({
    queryKey: ["admin-invoices", escopo, filters?.status ?? null, filters?.userId ?? null],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_faturas_lista" as any, { p_escopo: escopo });
      if (error) throw error;
      let rows = ((data ?? []) as any[]).map((inv) => ({
        ...inv,
        subscription: inv.plan_name || inv.plan_slug ? { plan: { name: inv.plan_name, slug: inv.plan_slug } } : null,
      }));
      if (filters?.status) rows = rows.filter((r) => r.status === filters.status);
      if (filters?.userId) rows = rows.filter((r) => r.user_id === filters.userId);
      return rows;
    },
  });
}

export function useUpdateSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: any) => {
      const { error } = await supabase.from("subscriptions").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-subscriptions"] });
      qc.invalidateQueries({ queryKey: ["current-subscription"] });
      toast.success("Assinatura atualizada");
    },
    onError: (e: any) => notifyError(e, { surface: "Sistema", action: "concluir a ação", fallback: "Erro ao atualizar" }),
  });
}

export function useUpdateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: any) => {
      const { error } = await supabase.from("invoices").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-invoices"] });
      toast.success("Fatura atualizada");
    },
    onError: (e: any) => notifyError(e, { surface: "Sistema", action: "concluir a ação", fallback: "Erro" }),
  });
}

export function useExemptSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      subscriptionId: string;
      planId: string;
      mode: "permanent" | "until";
      exemptUntil?: string | null;
      reason?: string | null;
      motivoCodigo?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("admin-exempt-subscription", { body: payload });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-subscriptions"] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["current-subscription"] });
      qc.invalidateQueries({ queryKey: ["admin-audit-logs"] });
      toast.success("Cliente isentado da mensalidade");
    },
    onError: (e: any) => notifyError(e, { surface: "Sistema", action: "concluir a ação", fallback: "Erro ao isentar" }),
  });
}

export function useRemoveExemption() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ subscriptionId, reason }: { subscriptionId: string; reason: string }) => {
      const { data, error } = await supabase.functions.invoke("admin-remove-exemption", {
        body: { subscriptionId, reason },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["admin-subscriptions"] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["current-subscription"] });
      qc.invalidateQueries({ queryKey: ["admin-audit-logs"] });
      const d = data as any;
      const ate = d?.graceEndsAt ? new Date(d.graceEndsAt).toLocaleDateString("pt-BR") : null;
      toast.success(`Cortesia revogada. Carência de ${d?.dias ?? ""} dias${ate ? ` (até ${ate})` : ""}.`, {
        description: d?.emailEnviado
          ? "O dono foi avisado por e-mail."
          : `O e-mail ao dono não foi enviado${d?.emailErro ? ` (${d.emailErro})` : ""}. Avise o cliente manualmente.`,
      });
    },
    onError: (e: any) => notifyError(e, { surface: "Sistema", action: "concluir a ação", fallback: "Erro ao remover isenção" }),
  });
}


export function useStartGrace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ subscriptionId, reason }: { subscriptionId: string; reason: string }) => {
      const { data, error } = await supabase.functions.invoke("admin-start-grace", {
        body: { subscriptionId, reason },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["admin-subscriptions"] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["current-subscription"] });
      qc.invalidateQueries({ queryKey: ["admin-audit-logs"] });
      const d = data as any;
      const ate = d?.graceEndsAt ? new Date(d.graceEndsAt).toLocaleDateString("pt-BR") : null;
      toast.success(`Carência de ${d?.dias ?? ""} dias iniciada${ate ? ` (até ${ate})` : ""}.`, {
        description: d?.emailEnviado
          ? "O dono foi avisado por e-mail."
          : `O e-mail ao dono não foi enviado${d?.emailErro ? ` (${d.emailErro})` : ""}. Avise o cliente manualmente.`,
      });
    },
    onError: (e: any) => notifyError(e, { surface: "Sistema", action: "concluir a ação", fallback: "Erro ao iniciar carência" }),
  });
}

