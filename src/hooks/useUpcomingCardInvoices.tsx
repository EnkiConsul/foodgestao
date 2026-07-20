import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import type { Database } from "@/integrations/supabase/types";

type Invoice = Database["public"]["Tables"]["credit_card_invoices"]["Row"];
type CardRow = Database["public"]["Tables"]["credit_cards"]["Row"];

export interface UpcomingInvoice {
  invoice: Invoice;
  card: Pick<CardRow, "id" | "brand" | "last4" | "credit_limit" | "closing_day" | "due_day">;
  remaining: number;
  daysUntilDue: number;
}

export function useUpcomingCardInvoices(limit = 6) {
  const { user } = useAuth();
  const { contextType, selectedCompanyId } = useCompanyContext();

  useRealtimeSync({
    tables: ["credit_cards", "credit_card_invoices"],
    invalidateKeyPrefixes: ["dashboard-cards-"],
  });

  return useQuery({
    queryKey: ["dashboard-cards-upcoming", user?.id, contextType, selectedCompanyId, limit],
    enabled: !!user && (contextType === "pf" || !!selectedCompanyId),
    queryFn: async () => {
      let cq = supabase.from("credit_cards").select("id,brand,last4,credit_limit,closing_day,due_day,context,company_id,is_active");
      if (contextType === "pj") cq = cq.eq("context", "pj").eq("company_id", selectedCompanyId!);
      else cq = cq.eq("context", "pf");
      const { data: cards, error: ce } = await cq;
      if (ce) throw ce;
      const activeCards = (cards ?? []).filter((c) => c.is_active);
      if (activeCards.length === 0) return [] as UpcomingInvoice[];

      const ids = activeCards.map((c) => c.id);
      const { data: invs, error: ie } = await supabase
        .from("credit_card_invoices")
        .select("*")
        .in("credit_card_id", ids)
        .in("status", ["fechada", "parcial", "atrasada", "vencida", "aberta"])
        .order("due_date", { ascending: true })
        .limit(limit * 3);
      if (ie) throw ie;

      const cardMap = new Map(activeCards.map((c) => [c.id, c]));
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const rows: UpcomingInvoice[] = (invs ?? [])
        .map((inv) => {
          const card = cardMap.get(inv.credit_card_id);
          if (!card) return null;
          const remaining = Number(inv.total_amount) - Number(inv.paid_amount);
          if (remaining <= 0 && inv.status !== "aberta") return null;
          const due = new Date(inv.due_date + "T00:00:00");
          const days = Math.round((due.getTime() - today.getTime()) / 86400000);
          return { invoice: inv as Invoice, card, remaining, daysUntilDue: days } as UpcomingInvoice;
        })
        .filter((r): r is UpcomingInvoice => r !== null)
        .sort((a, b) => a.daysUntilDue - b.daysUntilDue)
        .slice(0, limit);

      return rows;
    },
    staleTime: 30_000,
  });
}
