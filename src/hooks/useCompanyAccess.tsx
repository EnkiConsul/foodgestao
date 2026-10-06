import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useCurrentSubscription } from "@/hooks/useCurrentSubscription";

/**
 * Motivo do bloqueio, conforme a política comercial:
 * - sem_assinatura: nenhuma assinatura válida
 * - trial_expirado: fim do teste sem plano contratado (bloqueio imediato)
 * - inadimplente_suspenso: 11 a 30 dias de atraso
 * - rescindido: 31 a 90 dias de atraso
 * - expirado_definitivo: acima de 90 dias (sem exportação)
 */
export type MotivoBloqueio =
  | "sem_assinatura"
  | "trial_expirado"
  | "inadimplente_suspenso"
  | "rescindido"
  | "expirado_definitivo"
  | "carencia_expirada";

export interface CompanyAccess {
  companyId: string | null;
  /** true quando o usuário é o dono da empresa selecionada */
  isOwner: boolean;
  /** situação da assinatura responsável pela empresa (a do dono) */
  status: string | null;
  trialEndsAt: string | null;
  blocked: boolean;
  motivo: MotivoBloqueio | null;
  diasAtraso: number | null;
  /** exportação de dados liberada durante a guarda de 90 dias */
  canExport: boolean;
  valorPendenteCents: number | null;
  faturaPendenteId: string | null;
  /** fim da carência pós-cortesia (status grace) */
  graceEndsAt: string | null;
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
        motivo: (row.motivo ?? null) as MotivoBloqueio | null,
        diasAtraso: row.dias_atraso ?? null,
        canExport: row.can_export !== false,
        valorPendenteCents: row.valor_pendente_cents ?? null,
        faturaPendenteId: row.fatura_pendente_id ?? null,
        graceEndsAt: row.grace_ends_at ?? null,
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
