import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { AppModule } from "@/lib/modules";
import {
  DENIED_MODULE_ENTITLEMENT,
  type ModuleEntitlement,
} from "@/lib/modules/entitlement";

/**
 * Direito de uso de qualquer módulo vendável para a empresa selecionada.
 * Decisão sempre do backend (`can_use_module`) — fail closed.
 */
export function useModuleEntitlement(module: AppModule, operation?: string) {
  const { user } = useAuth();
  const { contextType, selectedCompanyId } = useCompanyContext();
  const enabled = !!user && contextType === "pj" && !!selectedCompanyId;
  const op = operation ?? `${module}.dashboard`;

  const query = useQuery({
    queryKey: ["module-entitlement", module, selectedCompanyId, op],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<ModuleEntitlement> => {
      const { data, error } = await supabase.rpc("can_use_module", {
        p_company_id: selectedCompanyId!,
        p_module: module,
        p_operation: op,
      });
      if (error) throw error;
      return { ...DENIED_MODULE_ENTITLEMENT, ...(data as object) } as ModuleEntitlement;
    },
  });

  const entitlement: ModuleEntitlement = query.data ?? {
    ...DENIED_MODULE_ENTITLEMENT,
    module,
    operation: op,
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

export interface StartModuleTrialResult {
  success: boolean;
  code: string;
  message: string;
  trial_started_at?: string | null;
  trial_ends_at?: string | null;
}

/** Inicia o teste gratuito de 7 dias de um módulo (ação explícita do proprietário). */
export function useStartModuleTrial(module: AppModule) {
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();

  return useMutation({
    mutationFn: async (): Promise<StartModuleTrialResult> => {
      if (!selectedCompanyId) {
        return {
          success: false,
          code: "no_company",
          message: "Selecione uma empresa para iniciar o teste.",
        };
      }
      const { data, error } = await supabase.rpc("start_module_trial", {
        p_company_id: selectedCompanyId,
        p_module: module,
      });
      if (error) throw error;
      return data as unknown as StartModuleTrialResult;
    },
    onSuccess: (result) => {
      if (result.success) toast.success(result.message);
      else toast.error(result.message);
      queryClient.invalidateQueries({ queryKey: ["module-entitlement"] });
      queryClient.invalidateQueries({ queryKey: ["orders-entitlement"] });
      queryClient.invalidateQueries({ queryKey: ["company_modules"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Não foi possível iniciar o teste gratuito.");
    },
  });
}
