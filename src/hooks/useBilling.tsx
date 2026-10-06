import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { notifyError } from "@/lib/notifyError";

export function useAdminSubscriptions() {
  return useQuery({
    queryKey: ["admin-subscriptions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*, plan:plans(name, slug, price_cents, billing_period), company:companies(id, name, trade_name, cnpj), addons:subscription_addons(id, quantity, status, price_cents, is_exempt, prorata_cents, prorata_billed_at)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useAdminInvoices(filters?: { status?: string; userId?: string }) {
  return useQuery({
    queryKey: ["admin-invoices", filters],
    queryFn: async () => {
      let q = supabase
        .from("invoices")
        .select("*, subscription:subscriptions(plan:plans(name, slug))")
        .order("created_at", { ascending: false });
      if (filters?.status) q = q.eq("status", filters.status as any);
      if (filters?.userId) q = q.eq("user_id", filters.userId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
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

