import { Building2, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { startOfMonth, endOfMonth } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";

import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import {
  dashboardAccountsKey,
  dashboardCategoriesKey,
  dashboardTransactionsKey,
  fetchDashboardAccounts,
  fetchDashboardCategories,
  fetchDashboardTransactions,
} from "@/lib/dashboardQueries";

export function ContextSelector() {
  const { selectedCompanyId, companies, setContext, syncing } = useCompanyContext();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const currentValue = `pj|${selectedCompanyId}`;
  const currentLabel =
    companies.find((c) => c.id === selectedCompanyId)?.trade_name ||
    companies.find((c) => c.id === selectedCompanyId)?.name ||
    "";

  /**
   * Pré-carrega as consultas do Dashboard da empresa escolhida em paralelo com
   * o re-render da troca de contexto, para os números aparecerem sem espera.
   */
  const prefetchDashboard = (companyId: string) => {
    if (!user?.id) return;
    const scopeArgs = { userId: user.id, contextType: "pj" as const, companyId };
    const now = new Date();
    const txArgs = {
      ...scopeArgs,
      periodKey: "month",
      fromISO: startOfMonth(now).toISOString(),
      toISO: endOfMonth(now).toISOString(),
      paymentStatus: "todos" as const,
    };
    void queryClient.prefetchQuery({
      queryKey: dashboardTransactionsKey(txArgs),
      queryFn: () => fetchDashboardTransactions(txArgs),
    });
    void queryClient.prefetchQuery({
      queryKey: dashboardCategoriesKey(scopeArgs),
      queryFn: () => fetchDashboardCategories(scopeArgs),
    });
    void queryClient.prefetchQuery({
      queryKey: dashboardAccountsKey(scopeArgs),
      queryFn: () => fetchDashboardAccounts(scopeArgs),
    });
  };

  const handleChange = (val: string) => {
    const [, companyId] = val.split("|");
    const nextId = companyId === "null" ? null : companyId;
    if (nextId) prefetchDashboard(nextId);
    setContext("pj", nextId);
  };

  return (
    <Select value={currentValue} onValueChange={handleChange}>
      <SelectTrigger
        aria-label="Selecionar empresa"
        aria-busy={syncing}
        className="h-9 w-auto min-w-0 max-w-[42vw] shrink text-xs gap-1.5 border-dashed md:h-8 md:w-[180px] md:max-w-none"
      >
        {syncing ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate text-left">
          {currentLabel || "Selecione a empresa"}
        </span>
      </SelectTrigger>

      <SelectContent>
        {companies.map((c) => (
          <SelectItem key={c.id} value={`pj|${c.id}`}>
            <span className="flex items-center gap-2">
              <Building2 aria-hidden className="h-3.5 w-3.5" />
              <span className="truncate max-w-[220px]">{c.trade_name || c.name}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
