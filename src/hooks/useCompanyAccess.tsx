import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useCurrentSubscription } from "@/hooks/useCurrentSubscription";

export interface CompanyAccess {
  companyId: string | null;
  /** true quando o usuário é o dono da empresa selecionada */
  isOwner: boolean;
  /** situação da assinatura responsável pela empresa (a do dono) */
  status: string | null;
  trialEndsAt: string | null;
  blocked: boolean;
}

/**
 * Acesso efetivo à empresa selecionada.
 *
 * Regra: quem paga é o DONO da empresa. Portanto o bloqueio olha a assinatura
 * do dono, não a do usuário conectado — um convidado trabalha normalmente
 * enquanto o dono estiver em dia.
 */
export function useCompanyAccess() {
  const { user } = useAuth();
  const { selectedCompanyId, companies, loading: companiesLoading } = useCompanyContext();
  const ownSub = useCurrentSubscription();

  const query = useQuery({
    queryKey: ["company-access", user?.id, selectedCompanyId],
    enabled: !!user && !!selectedCompanyId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<CompanyAccess | null> => {
      if (!selectedCompanyId) return null;
      const { data, error } = await supabase.rpc("company_access_status", {
        _company_id: selectedCompanyId,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? (data[0] as any) : (data as any);
      if (!row) return null;
      return {
        companyId: row.company_id ?? selectedCompanyId,
        isOwner: !!row.is_owner,
        status: row.status ?? null,
        trialEndsAt: row.trial_ends_at ?? null,
        blocked: !!row.blocked,
      };
    },
  });

  const hasCompanies = companies.length > 0;
  const loading =
    companiesLoading ||
    ownSub.isLoading ||
    (!!selectedCompanyId && query.isLoading);

  return {
    loading,
    hasCompanies,
    access: query.data ?? null,
    /** sem empresa nenhuma: nada a bloquear por assinatura de empresa */
    ownSubscription: ownSub.data ?? null,
    isOwnerOfSelected: query.data?.isOwner ?? null,
    blocked: selectedCompanyId
      ? !!query.data?.blocked
      : Boolean(ownSub.data?.isBlocked),
  };
}
