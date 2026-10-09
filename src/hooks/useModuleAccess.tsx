import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";

export type AccessModelMode = "legado" | "sombra" | "v2";
export type ModuloAcesso = "financeiro" | "pessoas";

export interface ModuleAccessV2 {
  module: ModuloAcesso;
  allowed: boolean;
  status: string | null;
  motivo: string | null;
  dias_restantes: number | null;
  trial_ends_at: string | null;
  grace_ends_at: string | null;
  dias_atraso: number | null;
  fatura_pendente_id: string | null;
  can_export: boolean;
  grant?: string | null;
}

export interface CompanyEntitlements {
  mode: AccessModelMode;
  company_id: string;
  financeiro: ModuleAccessV2;
  pessoas: ModuleAccessV2;
}

export const MODULO_ROTULO: Record<ModuloAcesso, string> = {
  financeiro: "Financeiro 360°",
  pessoas: "Pessoas 360°",
};

/** Direito de uso por módulo (modelo v2). Em sombra, a chamada também registra diferenças. */
export function useCompanyEntitlements(companyIdOverride?: string | null) {
  const { user } = useAuth();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = companyIdOverride ?? selectedCompanyId;

  return useQuery({
    queryKey: ["company-entitlements", user?.id, companyId],
    enabled: !!user && !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<CompanyEntitlements | null> => {
      const { data, error } = await supabase.rpc("get_company_entitlements" as any, { _company_id: companyId });
      if (error) throw error;
      return (data as unknown as CompanyEntitlements) ?? null;
    },
  });
}

/** "qualquer" = rotas compartilhadas: liberado se ao menos um módulo estiver liberado. */
export function useModuleAccess(module: ModuloAcesso | "qualquer") {
  const q = useCompanyEntitlements();
  const mode: AccessModelMode = q.data?.mode ?? "legado";
  const access =
    module === "qualquer"
      ? q.data
        ? q.data.financeiro?.allowed ? q.data.financeiro : q.data.pessoas
        : null
      : q.data?.[module] ?? null;
  return {
    loading: q.isLoading,
    mode,
    access,
    /** Só bloqueia de fato quando o modelo v2 estiver ligado. */
    blocked: mode === "v2" && !!access && !access.allowed,
  };
}
