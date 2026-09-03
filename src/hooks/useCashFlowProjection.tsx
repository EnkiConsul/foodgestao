import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { dashboardAccountsKey, fetchDashboardAccounts } from "@/lib/dashboardQueries";


export type HorizonDays = 7 | 15 | 30 | 60 | 90;

export interface CashFlowPoint {
  date: string; // ISO YYYY-MM-DD
  label: string; // dd/MM
  inflow: number;
  outflow: number;
  cardOutflow: number;
  netFlow: number;
  projectedBalance: number;
}

export interface CashFlowTotals {
  startingBalance: number;
  totalInflow: number;
  totalOutflow: number;
  totalCardOutflow: number;
  endingBalance: number;
  lowestBalance: number;
  lowestDate: string | null;
}

function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseISODate(s: string) {
  return new Date(`${s.slice(0, 10)}T00:00:00`);
}

export function useCashFlowProjection(horizonDays: HorizonDays) {
  const { user } = useAuth();
  const { contextType, selectedCompanyId } = useCompanyContext();
  const queryClient = useQueryClient();


  useRealtimeSync({
    tables: ["transactions", "accounts", "credit_cards", "credit_card_invoices"],
    invalidateKeyPrefixes: ["cash-flow-projection-"],
  });

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const horizonEnd = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + horizonDays);
    return d;
  }, [today, horizonDays]);

  const startISO = toISODate(today);
  const endISO = toISODate(horizonEnd);

  const query = useQuery({
    queryKey: [
      "cash-flow-projection",
      user?.id,
      contextType,
      selectedCompanyId,
      horizonDays,
      startISO,
    ],
    enabled: !!user && (contextType === "pf" || !!selectedCompanyId),
    staleTime: 30_000,
    queryFn: async () => {
      if (contextType === "pj" && !selectedCompanyId) {
        return { points: [] as CashFlowPoint[], totals: emptyTotals() };
      }

      // 1) Contas (reaproveita o cache do Dashboard), lançamentos pendentes e
      //    cartões em paralelo — antes eram três idas e voltas em sequência.
      const accountsPromise = queryClient.ensureQueryData({
        queryKey: dashboardAccountsKey({
          userId: user!.id,
          contextType,
          companyId: selectedCompanyId,
        }),
        queryFn: () =>
          fetchDashboardAccounts({
            userId: user!.id,
            contextType,
            companyId: selectedCompanyId,
          }),
      });

      let txq = supabase
        .from("transactions")
        .select("amount, amount_paid, due_date, transaction_type, credit_card_invoice_id, status")
        .eq("status", "pendente")
        .gte("due_date", startISO)
        .lte("due_date", endISO)
        .is("credit_card_invoice_id", null)
        .neq("transaction_type", "transferencia");
      if (contextType === "pj") {
        txq = txq.eq("context", "pj").eq("company_id", selectedCompanyId!);
      } else {
        txq = txq.eq("context", "pf");
      }

      let cq = supabase.from("credit_cards").select("id, context, company_id, is_active");
      if (contextType === "pj") cq = cq.eq("context", "pj").eq("company_id", selectedCompanyId!);
      else cq = cq.eq("context", "pf");

      const [accountsData, txRes, cardsRes] = await Promise.all([
        accountsPromise,
        txq,
        cq,
      ]);

      const startingBalance = (accountsData ?? [])
        .filter((a) => a.is_active && a.account_type !== "cartao_credito")
        .reduce((s: number, a) => s + Number(a.current_balance ?? 0), 0);

      if (txRes.error) throw txRes.error;
      const txs = txRes.data;

      if (cardsRes.error) throw cardsRes.error;
      const cardIds = (cardsRes.data ?? []).filter((c) => c.is_active).map((c) => c.id);


      let invoices: Array<{ due_date: string; total_amount: number; paid_amount: number }> = [];
      if (cardIds.length > 0) {
        const { data: invs, error: ie } = await supabase
          .from("credit_card_invoices")
          .select("due_date, total_amount, paid_amount, status")
          .in("credit_card_id", cardIds)
          .in("status", ["aberta", "fechada", "parcial", "vencida", "atrasada"])
          .gte("due_date", startISO)
          .lte("due_date", endISO);
        if (ie) throw ie;
        invoices = (invs ?? []).map((i: any) => ({
          due_date: i.due_date,
          total_amount: Number(i.total_amount ?? 0),
          paid_amount: Number(i.paid_amount ?? 0),
        }));
      }

      // 4) Monta série diária
      const buckets = new Map<string, { inflow: number; outflow: number; cardOutflow: number }>();
      for (let i = 0; i <= horizonDays; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() + i);
        buckets.set(toISODate(d), { inflow: 0, outflow: 0, cardOutflow: 0 });
      }

      for (const t of txs ?? []) {
        if (!t.due_date) continue;
        const key = t.due_date.slice(0, 10);
        const b = buckets.get(key);
        if (!b) continue;
        const remaining = Math.max(0, Number(t.amount) - Number(t.amount_paid ?? 0));
        if (t.transaction_type === "entrada") b.inflow += remaining;
        else if (t.transaction_type === "saida" || t.transaction_type === "parcelamento")
          b.outflow += remaining;
      }

      for (const inv of invoices) {
        const key = inv.due_date.slice(0, 10);
        const b = buckets.get(key);
        if (!b) continue;
        const remaining = Math.max(0, inv.total_amount - inv.paid_amount);
        b.cardOutflow += remaining;
      }

      const points: CashFlowPoint[] = [];
      let running = startingBalance;
      let lowest = startingBalance;
      let lowestDate: string | null = null;
      let totalInflow = 0;
      let totalOutflow = 0;
      let totalCardOutflow = 0;

      const keys = Array.from(buckets.keys()).sort();
      for (const k of keys) {
        const b = buckets.get(k)!;
        const net = b.inflow - b.outflow - b.cardOutflow;
        running += net;
        totalInflow += b.inflow;
        totalOutflow += b.outflow;
        totalCardOutflow += b.cardOutflow;
        if (running < lowest) {
          lowest = running;
          lowestDate = k;
        }
        const d = parseISODate(k);
        points.push({
          date: k,
          label: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`,
          inflow: b.inflow,
          outflow: b.outflow,
          cardOutflow: b.cardOutflow,
          netFlow: net,
          projectedBalance: running,
        });
      }

      const totals: CashFlowTotals = {
        startingBalance,
        totalInflow,
        totalOutflow,
        totalCardOutflow,
        endingBalance: running,
        lowestBalance: lowest,
        lowestDate,
      };

      return { points, totals };
    },
  });

  return {
    points: query.data?.points ?? [],
    totals: query.data?.totals ?? emptyTotals(),
    isLoading: query.isLoading,
  };
}

function emptyTotals(): CashFlowTotals {
  return {
    startingBalance: 0,
    totalInflow: 0,
    totalOutflow: 0,
    totalCardOutflow: 0,
    endingBalance: 0,
    lowestBalance: 0,
    lowestDate: null,
  };
}
