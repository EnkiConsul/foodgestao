import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { OrdersEntitlement } from "@/lib/orders/entitlement";
import { buildOrdersExportCsv, type OrdersUsageSummary } from "@/lib/orders/trial";

export interface OrdersTrialSnapshot {
  entitlement: OrdersEntitlement;
  status: string;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  expired_at: string | null;
  contracted_at: string | null;
  server_now: string;
  retention_days: number;
  consulta_until: string | null;
  usage: OrdersUsageSummary;
  pending_setup: { unit_id: string; unit_code: string | null; missing: string[] }[];
}

/** Resumo do teste/consulta da empresa selecionada (uso, pendências, retenção). */
export function useOrdersTrialSnapshot() {
  const { user } = useAuth();
  const { contextType, selectedCompanyId } = useCompanyContext();
  const enabled = !!user && contextType === "pj" && !!selectedCompanyId;

  return useQuery({
    queryKey: ["orders-trial-snapshot", selectedCompanyId],
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<OrdersTrialSnapshot> => {
      const { data, error } = await supabase.rpc("orders_trial_snapshot", {
        p_company_id: selectedCompanyId!,
      });
      if (error) throw error;
      return data as unknown as OrdersTrialSnapshot;
    },
  });
}

interface ContractResult {
  success: boolean;
  code: string;
  message: string;
  units_restored?: number;
  channels_restored?: number;
}

/** Contratação do módulo Pedidos (proprietário/administrador). */
export function useContractOrdersModule() {
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();

  return useMutation({
    mutationFn: async (options?: { reopenUnits?: boolean; reference?: string }) => {
      if (!selectedCompanyId) {
        return {
          success: false,
          code: "no_company",
          message: "Selecione uma empresa para contratar o módulo.",
        } satisfies ContractResult;
      }
      const { data, error } = await supabase.rpc("contract_orders_module", {
        p_company_id: selectedCompanyId,
        p_reference: options?.reference ?? null,
        p_reopen_units: options?.reopenUnits ?? false,
      });
      if (error) throw error;
      return data as unknown as ContractResult;
    },
    onSuccess: (result) => {
      if (result.success) toast.success(result.message);
      else toast.error(result.message);
      queryClient.invalidateQueries({ queryKey: ["orders-entitlement"] });
      queryClient.invalidateQueries({ queryKey: ["orders-trial-snapshot"] });
      queryClient.invalidateQueries({ queryKey: ["ped_units"] });
      queryClient.invalidateQueries({ queryKey: ["company_modules"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Não foi possível concluir a contratação.");
    },
  });
}

/** Exportação dos pedidos do período (permitida também em modo consulta). */
export function useExportOrders() {
  const { selectedCompanyId } = useCompanyContext();

  return useMutation({
    mutationFn: async (range?: { from?: string; to?: string }) => {
      if (!selectedCompanyId) throw new Error("Selecione uma empresa.");
      const { data, error } = await supabase.rpc("ped_export_orders", {
        p_company_id: selectedCompanyId,
        p_from: range?.from ?? null,
        p_to: range?.to ?? null,
      });
      if (error) throw error;
      const payload = data as unknown as { count: number; rows: Record<string, unknown>[] };
      const csv = buildOrdersExportCsv(payload.rows ?? []);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `pedidos-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      return payload.count ?? 0;
    },
    onSuccess: (count) => {
      toast.success(
        count > 0
          ? `${count} ${count === 1 ? "pedido exportado" : "pedidos exportados"}.`
          : "Nenhum pedido encontrado no período.",
      );
    },
    onError: (error: Error) => {
      toast.error(error.message || "Não foi possível exportar os pedidos.");
    },
  });
}
