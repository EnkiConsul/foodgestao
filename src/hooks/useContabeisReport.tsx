import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";

export type Regime = "caixa" | "competencia";

export interface ReportNode {
  id: string;
  parent_id: string | null;
  code: string;
  name: string;
  level: number;
  is_analytic: boolean;
  is_active: boolean;
  root_code: string;
  nature: string | null;
  dre_sign: number | null;
  in_dre: boolean | null;
  in_balance: boolean | null;
  debitos: number;
  creditos: number;
  saldo_proprio: number;
  saldo_consolidado: number;
  has_movement: boolean;
}

export interface ReportFilters {
  from: string; // yyyy-MM-dd
  to: string;
  regime: Regime;
  cost_center_ids?: string[] | null;
  include_zero?: boolean;
}

export function useContabeisReport(filters: ReportFilters, enabled = true) {
  const { user } = useAuth();
  const { contextType, selectedCompanyId } = useCompanyContext();

  useRealtimeSync({
    tables: ["chart_accounts", "transactions", "categories", "category_companies"],
    invalidateKeyPrefixes: ["contabeis-"],
  });

  return useQuery({
    queryKey: [
      "contabeis-report",
      contextType,
      selectedCompanyId,
      filters.from,
      filters.to,
      filters.regime,
      (filters.cost_center_ids ?? []).join(","),
      !!filters.include_zero,
    ],
    enabled: !!user && enabled && (contextType === "pf" || !!selectedCompanyId),
    queryFn: async () => {
      const params = {
        _context: contextType,
        _company_id: contextType === "pj" ? selectedCompanyId : null,
        _from: filters.from,
        _to: filters.to,
        _regime: filters.regime,
        _cost_center_ids: filters.cost_center_ids ?? null,
        _include_zero: !!filters.include_zero,
      };

      const { data, error } = await (supabase as any).rpc("chart_accounts_report", params);
      if (error) throw error;

      // Rede de segurança: empresa/contexto sem plano de contas vinculado.
      // Só faz sentido quando nem as contas sem movimento aparecem — por isso
      // confirmamos antes com _include_zero=true (período vazio não é erro).
      if (!data || data.length === 0) {
        if (!params._include_zero) {
          const probe = await (supabase as any).rpc("chart_accounts_report", {
            ...params,
            _include_zero: true,
          });
          if (!probe.error && (probe.data?.length ?? 0) > 0) {
            return [] as ReportNode[]; // plano existe, apenas sem movimento no período
          }
        }
        const { error: ensureError } = await (supabase as any).rpc("chart_accounts_ensure", {
          _context: contextType,
          _company_id: contextType === "pj" ? selectedCompanyId : null,
        });
        if (!ensureError) {
          const retry = await (supabase as any).rpc("chart_accounts_report", params);
          if (retry.error) throw retry.error;
          return (retry.data ?? []) as ReportNode[];
        }
      }


      return (data ?? []) as ReportNode[];
    },

    staleTime: 30_000,
  });
}

export function useContabeisLedger(
  accountId: string | null,
  filters: Pick<ReportFilters, "from" | "to" | "regime">
) {
  const { user } = useAuth();
  const { contextType, selectedCompanyId } = useCompanyContext();

  return useQuery({
    queryKey: [
      "contabeis-ledger",
      contextType,
      selectedCompanyId,
      accountId,
      filters.from,
      filters.to,
      filters.regime,
    ],
    enabled:
      !!user &&
      !!accountId &&
      (contextType === "pf" || !!selectedCompanyId),
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("chart_accounts_ledger", {
        _context: contextType,
        _company_id: contextType === "pj" ? selectedCompanyId : null,
        _account_id: accountId,
        _from: filters.from,
        _to: filters.to,
        _regime: filters.regime,
      });
      if (error) throw error;
      return (data ?? []) as Array<{
        transaction_id: string;
        data: string;
        descricao: string;
        categoria: string | null;
        contato: string | null;
        origem: string | null;
        valor: number;
        sinal: number;
        saldo_acumulado: number;
      }>;
    },
  });
}

export function useContabeisPending(from: string, to: string) {
  const { user } = useAuth();
  const { contextType, selectedCompanyId } = useCompanyContext();

  useRealtimeSync({
    tables: ["transactions", "categories"],
    invalidateKeyPrefixes: ["contabeis-"],
  });

  return useQuery({
    queryKey: ["contabeis-pending", contextType, selectedCompanyId, from, to],
    enabled: !!user && (contextType === "pf" || !!selectedCompanyId),
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc(
        "chart_accounts_pending_classification",
        {
          _context: contextType,
          _company_id: contextType === "pj" ? selectedCompanyId : null,
          _from: from,
          _to: to,
          _limit: 200,
        }
      );
      if (error) throw error;
      return (data ?? []) as Array<{
        transaction_id: string;
        data: string;
        descricao: string;
        valor: number;
        transaction_type: string;
        motivo: string;
      }>;
    },
  });
}
