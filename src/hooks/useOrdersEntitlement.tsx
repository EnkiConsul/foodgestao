import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { OrdersPermissionKey } from "@/lib/orders/permissions";
import {
  DENIED_ENTITLEMENT,
  type OrdersEntitlement,
} from "@/lib/orders/entitlement";

/**
 * Direito de uso do módulo Pedidos para a empresa selecionada.
 * Decisão é sempre do backend (`can_use_orders_module`) — fail closed.
 */
export function useOrdersEntitlement(
  operation: OrdersPermissionKey = "orders.dashboard",
) {
  const { user } = useAuth();
  const { contextType, selectedCompanyId } = useCompanyContext();
  const enabled = !!user && contextType === "pj" && !!selectedCompanyId;

  const query = useQuery({
    queryKey: ["orders-entitlement", selectedCompanyId, operation],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<OrdersEntitlement> => {
      const { data, error } = await supabase.rpc("can_use_orders_module", {
        p_company_id: selectedCompanyId!,
        p_operation: operation,
      });
      if (error) throw error;
      return { ...DENIED_ENTITLEMENT, ...(data as object) } as OrdersEntitlement;
    },
  });

  const entitlement: OrdersEntitlement = query.data ?? {
    ...DENIED_ENTITLEMENT,
    reason: enabled ? "loading" : contextType === "pj" ? "no_company" : "personal_context",
  };

  return {
    entitlement,
    isLoading: enabled ? query.isLoading : false,
    isError: query.isError,
    refetch: query.refetch,
    allowed: entitlement.allowed,
    readOnly: entitlement.read_only,
    canStartTrial:
      !entitlement.trial_used &&
      entitlement.effective_status === "not_contracted" &&
      (entitlement.role === "owner" || entitlement.role === "admin"),
  };
}

interface StartTrialResult {
  success: boolean;
  code: string;
  message: string;
  trial_started_at?: string | null;
  trial_ends_at?: string | null;
}

/** Inicia o teste gratuito de 7 dias (ação explícita do proprietário). */
export function useStartOrdersTrial() {
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();

  return useMutation({
    mutationFn: async (): Promise<StartTrialResult> => {
      if (!selectedCompanyId) {
        return {
          success: false,
          code: "no_company",
          message: "Selecione uma empresa para iniciar o teste.",
        };
      }
      const { data, error } = await supabase.rpc("start_orders_trial", {
        p_company_id: selectedCompanyId,
      });
      if (error) throw error;
      return data as unknown as StartTrialResult;
    },
    onSuccess: (result) => {
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
      queryClient.invalidateQueries({ queryKey: ["orders-entitlement"] });
      queryClient.invalidateQueries({ queryKey: ["company_modules"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Não foi possível iniciar o teste gratuito.");
    },
  });
}
