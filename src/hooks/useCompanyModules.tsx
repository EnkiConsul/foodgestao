import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { AppModule, ModuleStatus } from "@/lib/modules";

export interface CompanyModuleRow {
  module: AppModule;
  status: ModuleStatus;
  starts_at: string | null;
  ends_at: string | null;
}

/**
 * Retorna o mapa { module -> status } para a empresa PJ selecionada.
 * Em contexto PF, retorna apenas Financeiro como ativo (compat).
 */
export function useCompanyModules() {
  const { contextType, selectedCompanyId } = useCompanyContext();

  const query = useQuery({
    queryKey: ["company_modules", contextType, selectedCompanyId],
    enabled: contextType === "pj" && !!selectedCompanyId,
    queryFn: async (): Promise<Record<AppModule, ModuleStatus>> => {
      const { data, error } = await supabase
        .from("company_modules")
        .select("module,status,starts_at,ends_at")
        .eq("company_id", selectedCompanyId!);
      if (error) throw error;
      const map = {} as Record<AppModule, ModuleStatus>;
      (data ?? []).forEach((r) => { map[r.module as AppModule] = r.status as ModuleStatus; });
      return map;
    },
    staleTime: 60_000,
  });

  const modules = query.data ?? ({} as Record<AppModule, ModuleStatus>);
  const getStatus = (mod: AppModule): ModuleStatus => {
    if (contextType === "pf") {
      return mod === "financeiro" ? "active" : "not_contracted";
    }
    return modules[mod] ?? "not_contracted";
  };

  return { getStatus, isLoading: query.isLoading, modules };
}
